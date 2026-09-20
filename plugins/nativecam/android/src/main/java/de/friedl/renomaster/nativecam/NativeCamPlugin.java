package de.friedl.renomaster.nativecam;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Range;
import android.util.Size;
import android.util.SparseIntArray;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Camera preview and capture over Camera2, run as gently as the sensor allows.
 *
 * Why this exists, after four rounds of device logs corrected the premise twice:
 *
 * The rear camera of this S24 always dies the same way - about two seconds of streaming,
 * then ERROR_CAMERA_DEVICE - and the device logs ruled out one explanation after another.
 * Not the logical camera switching to a broken lens: the main lens dies exactly like the
 * ultra-wide. Not the focus motor or the stabiliser: switching both off changed nothing,
 * and the owner focuses happily in Samsung's own Expert RAW. Not the lens module: it has
 * been replaced, and the fault came straight back.
 *
 * What is left is the camera board's power, which is also the owner's own reading of it -
 * and that is something software can only respond to in one way: ask the sensor to do less.
 * Every log so far shows the stream negotiated at 60 frames a second, twice what an
 * ordinary camera app requests. So this plugin now pins the slowest fixed frame rate the
 * sensor offers and starts at a small stream size, moving up one step only if the small one
 * survives (see sensorCandidates). Whether that helps is an open question the next device
 * log answers; if it does not, no app is going to drive this camera.
 *
 * What Camera2 buys over getUserMedia is exactly this: a browser negotiates frame rate and
 * sensor settings for you, a capture request states them. Physical-sensor pinning, which is
 * what this plugin was originally built for, is gone - it died faster and never delivered a
 * frame, while opening the whole camera at least streams.
 *
 * Everything it tries goes to JS as a "log" event and lands in the camera protocol, because
 * that protocol is all there is to read after the camera takes the app down with it.
 */
@CapacitorPlugin(
    name = "NativeCam",
    permissions = { @Permission(alias = NativeCamPlugin.CAMERA, strings = { Manifest.permission.CAMERA }) }
)
public class NativeCamPlugin extends Plugin {

    public static final String CAMERA = "camera";

    private static final long FIRST_FRAME_TIMEOUT_MS = 2500;
    /** every failed open leaves the camera service worse off, so it gets a moment to settle */
    private static final long RETRY_PAUSE_MS = 600;
    private static final long PREVIEW_INTERVAL_MS = 120; // ~8 fps - enough to frame a shot
    private static final int PREVIEW_JPEG_QUALITY = 55;
    private static final int STILL_JPEG_QUALITY = 92;

    private static final SparseIntArray DISPLAY_ROTATION_DEGREES = new SparseIntArray();
    static {
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_0, 0);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_90, 90);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_180, 180);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_270, 270);
    }

    private HandlerThread backgroundThread;
    private volatile Handler backgroundHandler;

    private volatile CameraDevice cameraDevice;
    private volatile CameraCaptureSession captureSession;
    private volatile ImageReader previewReader;
    private volatile Runnable watchdog;

    private String logicalCameraId;
    private List<Attempt> candidates;
    private int candidateIndex;
    private volatile Attempt activeAttempt;
    private volatile CameraCharacteristics activeCharacteristics;
    private volatile int frameRotation;

    private PluginCall startCall;
    private final AtomicBoolean startSettled = new AtomicBoolean(true);
    private final AtomicBoolean streaming = new AtomicBoolean(false);
    private volatile PluginCall pendingCapture;
    private volatile long lastPreviewEmitAt;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            result.put("supported", false);
            result.put("reason", "braucht Android 9 oder neuer");
            call.resolve(result);
            return;
        }
        try {
            CameraManager manager = manager();
            String id = manager != null ? pickBackCameraId(manager) : null;
            result.put("supported", id != null);
            if (id == null) result.put("reason", "keine Rückkamera gefunden");
        } catch (Exception error) {
            result.put("supported", false);
            result.put("reason", String.valueOf(error.getMessage()));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(CAMERA) == PermissionState.GRANTED) {
            startInternal(call);
        } else {
            requestPermissionForAlias(CAMERA, call, "cameraPermissionCallback");
        }
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            call.reject("Ohne Kamera-Berechtigung geht es nicht.");
            return;
        }
        if ("diagnose".equals(call.getMethodName())) {
            diagnose(call);
            return;
        }
        startInternal(call);
    }

    private void startInternal(PluginCall call) {
        if (cameraDevice != null || !startSettled.get()) {
            call.reject("Kamera läuft bereits");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Die eigene Kamera braucht Android 9 oder neuer");
            return;
        }
        CameraManager manager = manager();
        if (manager == null) {
            call.reject("Kein Kamera-Dienst auf diesem Gerät");
            return;
        }
        try {
            logicalCameraId = pickBackCameraId(manager);
            if (logicalCameraId == null) {
                call.reject("Keine Rückkamera gefunden");
                return;
            }
            candidates = sensorCandidates(manager, manager.getCameraCharacteristics(logicalCameraId));
            candidateIndex = 0;
            startCall = call;
            startSettled.set(false);
            startBackgroundThread();
            tryNextCandidate(manager);
        } catch (Exception error) {
            closeCamera();
            call.reject("Kamera konnte nicht geöffnet werden", error);
        }
    }

    @PluginMethod
    public void capture(PluginCall call) {
        if (captureSession == null || !streaming.get()) {
            call.reject("Kamera liefert gerade kein Bild");
            return;
        }
        if (pendingCapture != null) {
            call.reject("Es läuft schon eine Aufnahme");
            return;
        }
        // the photo is the next frame of the running stream, at full quality - there is no
        // second, higher resolution stream, see the note at the top
        pendingCapture = call;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        closeCamera();
        call.resolve();
    }

    /**
     * Runs the whole table of camera configurations once and writes the result to the
     * protocol - see CameraDiagnosis. Takes about a minute and hammers the camera on purpose,
     * so it only ever runs when the user asks for it from the settings.
     */
    @PluginMethod
    public void diagnose(PluginCall call) {
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            requestPermissionForAlias(CAMERA, call, "cameraPermissionCallback");
            return;
        }
        if (cameraDevice != null || !startSettled.get()) {
            call.reject("Erst die Kamera-Ansicht schließen");
            return;
        }
        CameraManager manager = manager();
        if (manager == null) {
            call.reject("Kein Kamera-Dienst auf diesem Gerät");
            return;
        }
        new Thread(() -> {
            try {
                new CameraDiagnosis(manager, this::emitLog).run();
                call.resolve();
            } catch (Exception error) {
                emitLog("✖ Vollprüfung abgebrochen: " + error);
                call.reject("Vollprüfung abgebrochen", error);
            }
        }, "NativeCamDiagnosis").start();
    }

    @Override
    protected void handleOnDestroy() {
        closeCamera();
    }

    // ---------------------------------------------------------------- opening, one sensor at a time

    /**
     * What to try, and in which order. Deliberately short: the device log showed every failed
     * open dragging the camera service further down, until the whole camera was gone and even
     * getUserMedia found nothing. Two attempts is all this hardware gets.
     *
     * The browser path, for all its faults, does deliver pictures for about two seconds before
     * the camera dies, and the load it is under is the last thing software can still turn down
     * (see the note at the top of the class). So the attempts differ only in stream size, the
     * smallest first, and both run at the slowest frame rate the sensor offers. The lens
     * inventory is still logged - it costs nothing and says what the hardware reports.
     */
    private List<Attempt> sensorCandidates(CameraManager manager, CameraCharacteristics logicalChars) {
        List<String> physical = new ArrayList<>(logicalChars.getPhysicalCameraIds());
        Collections.sort(physical, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return Long.compare(pixelArea(manager, b), pixelArea(manager, a));
            }
        });
        for (String id : physical) {
            emitLog("Linse " + id + ": " + describeSensor(manager, id));
        }
        emitLog("Bildraten: " + describeFpsRanges(logicalChars));

        List<Attempt> ordered = new ArrayList<>();
        ordered.add(new Attempt(640, 480));
        ordered.add(new Attempt(1280, 720));
        return ordered;
    }

    /** one go at the camera, at a given load - see sensorCandidates for why load is the axis */
    private static final class Attempt {
        final int longEdge;
        final int shortEdge;

        Attempt(int longEdge, int shortEdge) {
            this.longEdge = longEdge;
            this.shortEdge = shortEdge;
        }

        @Override
        public String toString() {
            return longEdge + "×" + shortEdge;
        }
    }

    @SuppressLint("MissingPermission") // start() only gets here with the permission granted
    private void tryNextCandidate(CameraManager manager) {
        if (candidates == null || candidateIndex >= candidates.size()) {
            emitLog("auch die sparsamste Einstellung hält die Kamera nicht am Leben");
            giveUp("Die Kamera dieses Geräts bricht auch bei kleinster Last ab");
            return;
        }
        Attempt attempt = candidates.get(candidateIndex++);
        activeAttempt = attempt;
        streaming.set(false);
        emitLog("versuche " + describeActive());
        try {
            CameraCharacteristics chars = manager.getCameraCharacteristics(logicalCameraId);
            activeCharacteristics = chars;
            StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size[] sizes = map == null ? null : map.getOutputSizes(ImageFormat.YUV_420_888);
            if (sizes == null || sizes.length == 0) {
                failCandidate(manager, "nennt keine Auflösung");
                return;
            }
            Size size = pickStreamSize(sizes, attempt);
            frameRotation = computeRotation(chars);
            emitLog(describeActive() + ": Strom " + size.getWidth() + "×" + size.getHeight()
                + ", Drehung " + frameRotation + "°");

            previewReader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.YUV_420_888, 3);
            previewReader.setOnImageAvailableListener(this::onPreviewFrame, backgroundHandler);
            manager.openCamera(logicalCameraId, deviceCallback(manager), backgroundHandler);
        } catch (Exception error) {
            failCandidate(manager, "lässt sich nicht öffnen: " + error);
        }
    }

    private CameraDevice.StateCallback deviceCallback(CameraManager manager) {
        return new CameraDevice.StateCallback() {
            @Override
            public void onOpened(CameraDevice device) {
                cameraDevice = device;
                try {
                    configureSession(manager);
                } catch (Exception error) {
                    failCandidate(manager, "Sitzung nicht aufzubauen: " + error);
                }
            }

            @Override
            public void onDisconnected(CameraDevice device) {
                failCandidate(manager, "getrennt");
            }

            @Override
            public void onError(CameraDevice device, int error) {
                failCandidate(manager, "Kamera-Fehler " + error + " (" + describeDeviceError(error) + ")");
            }
        };
    }

    private void configureSession(CameraManager manager) throws CameraAccessException {
        OutputConfiguration output = new OutputConfiguration(previewReader.getSurface());

        SessionConfiguration config = new SessionConfiguration(
            SessionConfiguration.SESSION_REGULAR,
            Collections.singletonList(output),
            getContext().getMainExecutor(),
            new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession session) {
                    captureSession = session;
                    try {
                        CameraDevice device = cameraDevice;
                        ImageReader reader = previewReader;
                        if (device == null || reader == null) return;
                        CaptureRequest.Builder builder = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        builder.addTarget(reader.getSurface());
                        holdEverythingStill(builder);
                        session.setRepeatingRequest(builder.build(), null, backgroundHandler);
                        armWatchdog(manager);
                    } catch (Exception error) {
                        failCandidate(manager, "Vorschau nicht zu starten: " + error);
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession session) {
                    failCandidate(manager, "Sitzung abgelehnt");
                }
            }
        );
        cameraDevice.createCaptureSession(config);
    }

    /**
     * Switches off everything in the camera module that physically moves.
     *
     * This is the experiment the browser could never really run. On this phone the camera dies
     * one to two seconds after the stream starts, whichever lens is used and whether or not a
     * physical sensor is pinned - and one to two seconds in is exactly when the autofocus makes
     * its first sweep and the optical stabiliser takes over. On a camera module with mechanical
     * damage those are the parts that fault. getUserMedia can ask for a focus mode after the
     * fact and hope; a capture request can say "do not move" before the first frame is taken.
     *
     * Each setting is only applied when the sensor says it supports it, and what was applied
     * goes to the protocol - if this run survives, the log says which of them did it.
     */
    private void holdEverythingStill(CaptureRequest.Builder builder) {
        CameraCharacteristics chars = activeCharacteristics;
        if (chars == null) return;
        List<String> applied = new ArrayList<>();

        // The frame rate is the biggest single draw on the sensor, and the browser path was
        // negotiating 60/s - twice what a normal camera app asks for. On a phone whose camera
        // board has a marginal supply (this one: lens already replaced, fault came straight
        // back, Samsung's own app runs fine at 30) that is the most plausible thing left that
        // software can turn down. Slowest range the sensor offers, fixed so it cannot ramp.
        Range<Integer> fps = slowestFpsRange(chars);
        if (fps != null) {
            builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fps);
            applied.add("Bildrate " + fps.getLower() + "–" + fps.getUpper() + "/s");
        }

        if (supportsAfMode(chars, CameraMetadata.CONTROL_AF_MODE_OFF)) {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF);
            applied.add("Autofokus aus");
            Float closest = chars.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
            if (closest != null && closest > 0f) {
                // dioptres: 1.0 is a metre away, and the depth of field of a phone sensor
                // covers roughly half a metre to a few metres from there
                float distance = Math.min(1.0f, closest);
                builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, distance);
                applied.add("Fokus fest auf " + distance);
            }
        }

        if (supportsStabilisation(chars)) {
            builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_OFF);
            applied.add("Bildstabilisator aus");
        }
        builder.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
            CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
        applied.add("Videostabilisierung aus");

        emitLog(describeActive() + ": " + (applied.isEmpty() ? "nichts festzuhalten" : join(applied)));
    }

    private boolean supportsAfMode(CameraCharacteristics chars, int mode) {
        int[] modes = chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
        if (modes == null) return false;
        for (int available : modes) {
            if (available == mode) return true;
        }
        return false;
    }

    private boolean supportsStabilisation(CameraCharacteristics chars) {
        int[] modes = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
        if (modes == null) return false;
        for (int mode : modes) {
            if (mode == CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON) return true;
        }
        return false;
    }

    private String join(List<String> parts) {
        StringBuilder text = new StringBuilder();
        for (String part : parts) {
            if (text.length() > 0) text.append(", ");
            text.append(part);
        }
        return text.toString();
    }

    /**
     * A sensor that configures fine and then never delivers is exactly what the first device
     * run showed, so silence counts as failure and the next sensor gets its turn.
     */
    private void armWatchdog(CameraManager manager) {
        cancelWatchdog();
        Handler handler = backgroundHandler;
        if (handler == null) return;
        Runnable task = () -> {
            if (streaming.get()) return;
            failCandidate(manager, "kein Bild innerhalb von " + FIRST_FRAME_TIMEOUT_MS + " ms");
        };
        watchdog = task;
        handler.postDelayed(task, FIRST_FRAME_TIMEOUT_MS);
    }

    private void cancelWatchdog() {
        Runnable task = watchdog;
        watchdog = null;
        Handler handler = backgroundHandler;
        if (task != null && handler != null) handler.removeCallbacks(task);
    }

    /**
     * One sensor gave up. Before the first frame that just means the next one is tried;
     * afterwards the view is already showing pictures, so JS is told instead.
     */
    private void failCandidate(CameraManager manager, String reason) {
        emitLog(describeActive() + ": " + reason);
        cancelWatchdog();
        boolean afterFirstFrame = startSettled.get();
        closeDevice();
        if (afterFirstFrame) {
            JSObject payload = new JSObject();
            payload.put("message", reason);
            notifyListeners("error", payload);
            return;
        }
        // the device log showed the camera service itself disappearing after two failed opens
        // ("unknown device 0"), taking getUserMedia down with it - so once it is gone, stop
        if (!cameraServiceAlive(manager)) {
            emitLog("der Kameradienst des Geräts antwortet nicht mehr – keine weiteren Versuche");
            giveUp("Der Kameradienst des Geräts ist ausgefallen");
            return;
        }
        Handler handler = backgroundHandler;
        if (handler == null) {
            tryNextCandidate(manager);
            return;
        }
        handler.postDelayed(() -> tryNextCandidate(manager), RETRY_PAUSE_MS);
    }

    private boolean cameraServiceAlive(CameraManager manager) {
        try {
            manager.getCameraCharacteristics(logicalCameraId);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    /** settles the start() call with the real reason before the teardown overwrites it */
    private void giveUp(String reason) {
        finishStart(false, reason);
        closeCamera();
    }

    private void finishStart(boolean ok, String reason) {
        if (!startSettled.compareAndSet(false, true)) return;
        PluginCall call = startCall;
        startCall = null;
        if (call == null) return;
        if (ok) {
            call.resolve(new JSObject());
        } else {
            call.reject(reason == null ? "Kamera konnte nicht geöffnet werden" : reason);
        }
    }

    // ---------------------------------------------------------------- frames

    private void onPreviewFrame(ImageReader reader) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            if (streaming.compareAndSet(false, true)) {
                cancelWatchdog();
                emitLog(describeActive() + ": erstes Bild da");
                finishStart(true, null);
            }

            PluginCall capture = pendingCapture;
            if (capture != null) {
                pendingCapture = null;
                JSObject photo = encode(image, STILL_JPEG_QUALITY);
                photo.put("mime", "image/jpeg");
                capture.resolve(photo);
            }

            long now = System.currentTimeMillis();
            if (now - lastPreviewEmitAt >= PREVIEW_INTERVAL_MS) {
                lastPreviewEmitAt = now;
                notifyListeners("frame", encode(image, PREVIEW_JPEG_QUALITY));
            }
        } catch (Exception error) {
            // one lost frame is not worth reporting - the next one is a moment away
        } finally {
            image.close();
        }
    }

    /** the frame as an upright JPEG; rotation has to happen here, the stream has no EXIF */
    private JSObject encode(Image image, int quality) {
        int width = image.getWidth();
        int height = image.getHeight();
        YuvImage yuv = new YuvImage(yuv420ToNv21(image), ImageFormat.NV21, width, height, null);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        yuv.compressToJpeg(new Rect(0, 0, width, height), quality, out);
        byte[] jpeg = out.toByteArray();

        int rotation = frameRotation;
        if (rotation != 0) {
            Bitmap decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
            if (decoded != null) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotation);
                Bitmap rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
                ByteArrayOutputStream rotatedOut = new ByteArrayOutputStream();
                rotated.compress(Bitmap.CompressFormat.JPEG, quality, rotatedOut);
                jpeg = rotatedOut.toByteArray();
                width = rotated.getWidth();
                height = rotated.getHeight();
                if (rotated != decoded) decoded.recycle();
                rotated.recycle();
            }
        }

        JSObject result = new JSObject();
        result.put("base64", Base64.encodeToString(jpeg, Base64.NO_WRAP));
        result.put("width", width);
        result.put("height", height);
        return result;
    }

    /**
     * YUV_420_888 to NV21, respecting row and pixel stride - a tightly packed copy looks
     * fine on some devices and diagonally torn on others, and the preview is the one thing
     * here that has to look right on screen.
     */
    private byte[] yuv420ToNv21(Image image) {
        int width = image.getWidth();
        int height = image.getHeight();
        Image.Plane yPlane = image.getPlanes()[0];
        Image.Plane uPlane = image.getPlanes()[1];
        Image.Plane vPlane = image.getPlanes()[2];

        byte[] nv21 = new byte[width * height * 3 / 2];
        int pos = 0;

        ByteBuffer yBuffer = yPlane.getBuffer();
        int yRowStride = yPlane.getRowStride();
        for (int row = 0; row < height; row++) {
            yBuffer.position(row * yRowStride);
            yBuffer.get(nv21, pos, width);
            pos += width;
        }

        int chromaHeight = height / 2;
        int chromaWidth = width / 2;
        ByteBuffer uBuffer = uPlane.getBuffer();
        ByteBuffer vBuffer = vPlane.getBuffer();
        int uRowStride = uPlane.getRowStride();
        int uPixelStride = uPlane.getPixelStride();
        int vRowStride = vPlane.getRowStride();
        int vPixelStride = vPlane.getPixelStride();
        for (int row = 0; row < chromaHeight; row++) {
            for (int col = 0; col < chromaWidth; col++) {
                nv21[pos++] = vBuffer.get(row * vRowStride + col * vPixelStride);
                nv21[pos++] = uBuffer.get(row * uRowStride + col * uPixelStride);
            }
        }
        return nv21;
    }

    // ---------------------------------------------------------------- picking cameras and sizes

    /** the logical back camera when there is one, so its physical sensors stay reachable */
    private String pickBackCameraId(CameraManager manager) throws CameraAccessException {
        String bestPlain = null;
        long bestPlainPixels = -1;
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
            if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
            if (isLogicalMultiCamera(chars)) return id;
            Size pixels = chars.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
            long area = pixels == null ? 0 : (long) pixels.getWidth() * pixels.getHeight();
            if (area > bestPlainPixels) {
                bestPlainPixels = area;
                bestPlain = id;
            }
        }
        return bestPlain;
    }

    private boolean isLogicalMultiCamera(CameraCharacteristics chars) {
        int[] capabilities = chars.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        if (capabilities == null) return false;
        for (int capability : capabilities) {
            if (capability == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA) return true;
        }
        return false;
    }

    private long pixelArea(CameraManager manager, String id) {
        try {
            Size pixels = manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
            return pixels == null ? 0 : (long) pixels.getWidth() * pixels.getHeight();
        } catch (Exception error) {
            return 0;
        }
    }

    private String describeSensor(CameraManager manager, String id) {
        try {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            Size pixels = chars.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
            float[] focal = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
            return (pixels == null ? "?×?" : pixels.getWidth() + "×" + pixels.getHeight())
                + " Brennweite " + (focal != null && focal.length > 0 ? focal[0] : 0f);
        } catch (Exception error) {
            return "nicht lesbar (" + error.getClass().getSimpleName() + ")";
        }
    }

    private Size pickStreamSize(Size[] sizes, Attempt attempt) {
        Size best = null;
        Size smallest = sizes[0];
        for (Size size : sizes) {
            if (area(size) < area(smallest)) smallest = size;
            int longEdge = Math.max(size.getWidth(), size.getHeight());
            int shortEdge = Math.min(size.getWidth(), size.getHeight());
            if (longEdge > attempt.longEdge || shortEdge > attempt.shortEdge) continue;
            if (best == null || area(size) > area(best)) best = size;
        }
        return best != null ? best : smallest;
    }

    /** the slowest fixed rate the sensor offers - see holdEverythingStill for why */
    private Range<Integer> slowestFpsRange(CameraCharacteristics chars) {
        Range<Integer>[] ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        if (ranges == null || ranges.length == 0) return null;
        Range<Integer> best = null;
        for (Range<Integer> range : ranges) {
            if (best == null
                || range.getUpper() < best.getUpper()
                // same ceiling: take the one that cannot speed up
                || (range.getUpper().equals(best.getUpper()) && range.getLower() > best.getLower())) {
                best = range;
            }
        }
        return best;
    }

    private String describeFpsRanges(CameraCharacteristics chars) {
        Range<Integer>[] ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        if (ranges == null || ranges.length == 0) return "nennt keine";
        List<String> parts = new ArrayList<>();
        for (Range<Integer> range : ranges) {
            parts.add(range.getLower() + "–" + range.getUpper());
        }
        return join(parts);
    }

    private long area(Size size) {
        return (long) size.getWidth() * size.getHeight();
    }

    /** degrees the frame has to turn to stand upright on the screen, for a back sensor */
    private int computeRotation(CameraCharacteristics characteristics) {
        Integer sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
        int display = currentDisplayRotationDegrees();
        return (((sensorOrientation == null ? 0 : sensorOrientation) - display) + 360) % 360;
    }

    private int currentDisplayRotationDegrees() {
        if (getActivity() == null || getActivity().getWindowManager() == null) return 0;
        int rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
        return DISPLAY_ROTATION_DEGREES.get(rotation, 0);
    }

    private String describeDeviceError(int error) {
        switch (error) {
            case CameraDevice.StateCallback.ERROR_CAMERA_IN_USE: return "schon in Benutzung";
            case CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE: return "zu viele Kameras offen";
            case CameraDevice.StateCallback.ERROR_CAMERA_DISABLED: return "abgeschaltet";
            case CameraDevice.StateCallback.ERROR_CAMERA_DEVICE: return "Linse selbst ausgefallen";
            case CameraDevice.StateCallback.ERROR_CAMERA_SERVICE: return "Kameradienst ausgefallen";
            default: return "unbekannt";
        }
    }

    private String describeActive() {
        Attempt attempt = activeAttempt;
        return attempt == null ? "Kamera" : "bis " + attempt;
    }

    private CameraManager manager() {
        return (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
    }

    private void emitLog(String message) {
        JSObject payload = new JSObject();
        payload.put("message", message);
        notifyListeners("log", payload);
    }

    // ---------------------------------------------------------------- teardown

    private void startBackgroundThread() {
        if (backgroundThread != null) return;
        backgroundThread = new HandlerThread("NativeCam");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    /**
     * Never join from the camera thread itself: the callbacks that close the camera run on
     * exactly that thread, and a thread joining itself waits forever - which is how one
     * ERROR_CAMERA_DEVICE left every later attempt hanging with no message at all.
     */
    private void stopBackgroundThread() {
        HandlerThread thread = backgroundThread;
        backgroundThread = null;
        backgroundHandler = null;
        if (thread == null) return;
        thread.quitSafely();
        if (Thread.currentThread() != thread) {
            try {
                thread.join(1000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /** closes device and session but keeps the thread, so the next sensor can be tried */
    private void closeDevice() {
        cancelWatchdog();
        streaming.set(false);
        CameraCaptureSession session = captureSession;
        captureSession = null;
        if (session != null) {
            try {
                session.close();
            } catch (Exception ignored) {
                // closing over an already-broken session is not worth reporting
            }
        }
        CameraDevice device = cameraDevice;
        cameraDevice = null;
        if (device != null) {
            try {
                device.close();
            } catch (Exception ignored) {
                // the device is going away either way
            }
        }
        ImageReader reader = previewReader;
        previewReader = null;
        if (reader != null) reader.close();
    }

    private void closeCamera() {
        closeDevice();
        PluginCall capture = pendingCapture;
        pendingCapture = null;
        if (capture != null) capture.reject("Kamera wurde geschlossen");
        finishStart(false, "Kamera wurde geschlossen");
        candidates = null;
        activeAttempt = null;
        activeCharacteristics = null;
        stopBackgroundThread();
    }
}
