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
 * Camera preview and capture over Camera2, pinned to one physical sensor.
 *
 * Why this exists: see platform/camera.ts. Samsung's logical rear camera switches between
 * its physical sensors on its own and takes the camera service down doing so, and no web
 * API can reach past the logical camera to stop it. Camera2 can: since Android 9,
 * OutputConfiguration#setPhysicalCameraId ties an output to one named sensor, so the
 * logical camera never arbitrates.
 *
 * What the first device run taught us, and what this code now does about it:
 *
 * - Picking the sensor with the longest focal length picked the telephoto, which died with
 *   ERROR_CAMERA_DEVICE. The sensors are now tried largest-pixel-array first (the main
 *   lens on any phone) and, if that one fails, the next one, down to running with no
 *   pinning at all. On a phone with a physically broken lens - which this one has - that
 *   ladder is the whole point.
 * - A full-resolution JPEG stream pinned to a physical sensor is outside the stream
 *   combinations Android guarantees for physical streams (1080p). There is now a single
 *   YUV stream at 1080p or below, used for both the preview and the photo.
 * - "Session configured" is not "camera works": the first run configured fine and died
 *   without ever delivering a frame. start() therefore only resolves once a frame has
 *   actually arrived, and a sensor that goes quiet for FIRST_FRAME_TIMEOUT_MS counts as
 *   failed and hands over to the next one.
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

    /** physical streams are only guaranteed up to 1080p, and this hardware is fragile enough */
    private static final int MAX_LONG_EDGE = 1920;
    private static final int MAX_SHORT_EDGE = 1080;
    private static final long FIRST_FRAME_TIMEOUT_MS = 2500;
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
    private List<String> candidates;
    private int candidateIndex;
    private volatile String activeSensorId;
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
            result.put("reason", "braucht Android 9 oder neuer für die physische Linsen-Bindung");
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
        startInternal(call);
    }

    private void startInternal(PluginCall call) {
        if (cameraDevice != null || !startSettled.get()) {
            call.reject("Kamera läuft bereits");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Kamera2 mit physischer Linsen-Bindung braucht Android 9 oder neuer");
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

    @Override
    protected void handleOnDestroy() {
        closeCamera();
    }

    // ---------------------------------------------------------------- opening, one sensor at a time

    /** the sensors to try, best first, with a final null meaning "no pinning at all" */
    private List<String> sensorCandidates(CameraManager manager, CameraCharacteristics logicalChars) {
        List<String> physical = new ArrayList<>(logicalChars.getPhysicalCameraIds());
        // biggest sensor first: that is the main lens, never the ultra-wide the logical
        // camera likes to switch to and never the telephoto
        Collections.sort(physical, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return Long.compare(pixelArea(manager, b), pixelArea(manager, a));
            }
        });
        for (String id : physical) {
            emitLog("Linse " + id + ": " + describeSensor(manager, id));
        }
        if (physical.isEmpty()) emitLog("Kamera " + logicalCameraId + " nennt keine einzelnen Linsen");
        List<String> ordered = new ArrayList<>(physical);
        ordered.add(null);
        return ordered;
    }

    @SuppressLint("MissingPermission") // start() only gets here with the permission granted
    private void tryNextCandidate(CameraManager manager) {
        if (candidates == null || candidateIndex >= candidates.size()) {
            emitLog("keine Linse dieser Kamera liefert ein Bild");
            closeCamera();
            finishStart(false, "Keine Linse dieser Kamera liefert ein Bild");
            return;
        }
        String sensorId = candidates.get(candidateIndex++);
        activeSensorId = sensorId;
        streaming.set(false);
        emitLog("versuche " + describeActive());
        try {
            CameraCharacteristics chars = manager.getCameraCharacteristics(
                sensorId != null ? sensorId : logicalCameraId);
            StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size[] sizes = map == null ? null : map.getOutputSizes(ImageFormat.YUV_420_888);
            if (sizes == null || sizes.length == 0) {
                failCandidate(manager, "nennt keine Auflösung");
                return;
            }
            Size size = pickStreamSize(sizes);
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
        if (activeSensorId != null) output.setPhysicalCameraId(activeSensorId);

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
                        builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
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
        tryNextCandidate(manager);
    }

    private void finishStart(boolean ok, String reason) {
        if (!startSettled.compareAndSet(false, true)) return;
        PluginCall call = startCall;
        startCall = null;
        if (call == null) return;
        if (ok) {
            JSObject result = new JSObject();
            if (activeSensorId != null) result.put("physicalCameraId", activeSensorId);
            call.resolve(result);
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

    private Size pickStreamSize(Size[] sizes) {
        Size best = null;
        Size smallest = sizes[0];
        for (Size size : sizes) {
            if (area(size) < area(smallest)) smallest = size;
            int longEdge = Math.max(size.getWidth(), size.getHeight());
            int shortEdge = Math.min(size.getWidth(), size.getHeight());
            if (longEdge > MAX_LONG_EDGE || shortEdge > MAX_SHORT_EDGE) continue;
            if (best == null || area(size) > area(best)) best = size;
        }
        return best != null ? best : smallest;
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
        return activeSensorId == null ? "ohne feste Linse" : "Linse " + activeSensorId;
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
        activeSensorId = null;
        stopBackgroundThread();
    }
}
