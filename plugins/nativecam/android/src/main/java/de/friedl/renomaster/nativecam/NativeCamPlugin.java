package de.friedl.renomaster.nativecam;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.ImageFormat;
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
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Camera preview and capture straight over Camera2, pinned to one physical sensor.
 *
 * Why this exists: see platform/camera.ts. Samsung's "camera2 0" is a logical camera that
 * silently hands the stream to a different physical sensor (the ultra-wide) for close focus
 * or low zoom, and on this hardware that switch takes the camera service down. getUserMedia
 * only ever sees the logical camera - there is no web API for the sensor underneath - so
 * nothing in the browser build can prevent the switch. Camera2 can: since Android 9,
 * OutputConfiguration#setPhysicalCameraId lets every output surface name the exact physical
 * sensor it wants, and the logical camera then never has a reason to arbitrate between
 * sensors on its own. That is the one thing this plugin does; everything else here is the
 * usual Camera2 boilerplate to get a preview and a still photo out of it.
 *
 * The preview is not a native view glued behind the WebView - that path (a TextureView
 * inserted into the view hierarchy with the WebView made transparent) cannot be exercised
 * without a device to test it on, and a subtly wrong z-order or coordinate conversion would
 * only show up there. Instead each preview frame is re-encoded as a small JPEG and handed to
 * JS as a "frame" event, a few times a second - slower than a real view, plenty to frame a
 * shot of a wall or a pipe.
 */
@CapacitorPlugin(
    name = "NativeCam",
    permissions = { @Permission(alias = NativeCamPlugin.CAMERA, strings = { Manifest.permission.CAMERA }) }
)
public class NativeCamPlugin extends Plugin {

    public static final String CAMERA = "camera";

    private static final int PREVIEW_MAX_WIDTH = 1280;
    private static final long PREVIEW_INTERVAL_MS = 120; // ~8 fps - enough to frame a shot
    private static final int PREVIEW_JPEG_QUALITY = 55;

    private static final SparseIntArray DISPLAY_ROTATION_DEGREES = new SparseIntArray();
    static {
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_0, 0);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_90, 90);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_180, 180);
        DISPLAY_ROTATION_DEGREES.append(Surface.ROTATION_270, 270);
    }

    private HandlerThread backgroundThread;
    private Handler backgroundHandler;

    private volatile CameraDevice cameraDevice;
    private volatile CameraCaptureSession captureSession;
    private ImageReader previewReader;
    private ImageReader stillReader;
    private volatile String physicalCameraId;
    private volatile int jpegOrientation;
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
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String id = manager != null ? pickBackCameraId(manager) : null;
            result.put("supported", id != null);
            if (id == null) result.put("reason", "keine Rückkamera gefunden");
        } catch (Exception error) {
            result.put("supported", false);
            result.put("reason", error.getMessage());
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

    @SuppressLint("MissingPermission") // gated by getPermissionState(CAMERA) above
    private void startInternal(PluginCall call) {
        if (cameraDevice != null) {
            call.reject("Kamera läuft bereits");
            return;
        }
        CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Kamera2 mit physischer Linsen-Bindung braucht Android 9 oder neuer");
            return;
        }
        AtomicBoolean settled = new AtomicBoolean(false);
        try {
            String logicalId = pickBackCameraId(manager);
            if (logicalId == null) {
                call.reject("Keine Rückkamera gefunden");
                return;
            }
            CameraCharacteristics logicalChars = manager.getCameraCharacteristics(logicalId);
            physicalCameraId = pickPhysicalId(manager, logicalChars);
            CameraCharacteristics streamChars = physicalCameraId != null
                ? manager.getCameraCharacteristics(physicalCameraId)
                : logicalChars;

            StreamConfigurationMap map = streamChars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) {
                call.reject("Kamera nennt keine unterstützten Auflösungen");
                return;
            }
            Size previewSize = pickPreviewSize(map.getOutputSizes(ImageFormat.YUV_420_888));
            Size stillSize = pickLargestSize(map.getOutputSizes(ImageFormat.JPEG));
            jpegOrientation = computeJpegOrientation(streamChars);

            startBackgroundThread();
            previewReader = ImageReader.newInstance(previewSize.getWidth(), previewSize.getHeight(), ImageFormat.YUV_420_888, 2);
            previewReader.setOnImageAvailableListener(this::onPreviewFrame, backgroundHandler);
            stillReader = ImageReader.newInstance(stillSize.getWidth(), stillSize.getHeight(), ImageFormat.JPEG, 2);
            stillReader.setOnImageAvailableListener(this::onStillImage, backgroundHandler);

            manager.openCamera(logicalId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice device) {
                    cameraDevice = device;
                    try {
                        configureSession(call, settled);
                    } catch (CameraAccessException error) {
                        rejectOnce(call, settled, "Aufnahmesitzung fehlgeschlagen", error);
                        closeCamera();
                    }
                }

                @Override
                public void onDisconnected(CameraDevice device) {
                    notifyListeners("error", errorPayload("Kamera getrennt"));
                    rejectOnce(call, settled, "Kamera getrennt", null);
                    closeCamera();
                }

                @Override
                public void onError(CameraDevice device, int error) {
                    notifyListeners("error", errorPayload("Kamera-Fehler " + error));
                    rejectOnce(call, settled, "Kamera-Fehler " + error, null);
                    closeCamera();
                }
            }, backgroundHandler);
        } catch (Exception error) {
            call.reject("Kamera konnte nicht geöffnet werden", error);
            closeCamera();
        }
    }

    private void configureSession(PluginCall call, AtomicBoolean settled) throws CameraAccessException {
        OutputConfiguration previewConfig = new OutputConfiguration(previewReader.getSurface());
        OutputConfiguration stillConfig = new OutputConfiguration(stillReader.getSurface());
        if (physicalCameraId != null) {
            previewConfig.setPhysicalCameraId(physicalCameraId);
            stillConfig.setPhysicalCameraId(physicalCameraId);
        }
        List<OutputConfiguration> outputs = new ArrayList<>();
        outputs.add(previewConfig);
        outputs.add(stillConfig);

        SessionConfiguration sessionConfig = new SessionConfiguration(
            SessionConfiguration.SESSION_REGULAR,
            outputs,
            getContext().getMainExecutor(),
            new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession session) {
                    captureSession = session;
                    try {
                        startRepeatingPreview();
                        JSObject result = new JSObject();
                        if (physicalCameraId != null) result.put("physicalCameraId", physicalCameraId);
                        if (settled.compareAndSet(false, true)) call.resolve(result);
                    } catch (CameraAccessException error) {
                        rejectOnce(call, settled, "Vorschau ließ sich nicht starten", error);
                        closeCamera();
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession session) {
                    rejectOnce(call, settled, "Aufnahmesitzung abgelehnt", null);
                    closeCamera();
                }
            }
        );
        cameraDevice.createCaptureSession(sessionConfig);
    }

    private void startRepeatingPreview() throws CameraAccessException {
        CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
        builder.addTarget(previewReader.getSurface());
        builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
        captureSession.setRepeatingRequest(builder.build(), null, backgroundHandler);
    }

    @PluginMethod
    public void capture(PluginCall call) {
        CameraDevice device = cameraDevice;
        CameraCaptureSession session = captureSession;
        if (device == null || session == null || stillReader == null) {
            call.reject("Kamera ist nicht offen");
            return;
        }
        if (pendingCapture != null) {
            call.reject("Es läuft schon eine Aufnahme");
            return;
        }
        pendingCapture = call;
        try {
            CaptureRequest.Builder builder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            builder.addTarget(stillReader.getSurface());
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            builder.set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation);
            session.capture(builder.build(), null, backgroundHandler);
        } catch (Exception error) {
            pendingCapture = null;
            call.reject("Aufnahme fehlgeschlagen", error);
        }
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

    private void rejectOnce(PluginCall call, AtomicBoolean settled, String message, Exception cause) {
        if (settled.compareAndSet(false, true)) {
            if (cause != null) call.reject(message, cause);
            else call.reject(message);
        }
    }

    private void onPreviewFrame(ImageReader reader) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            long now = System.currentTimeMillis();
            if (now - lastPreviewEmitAt < PREVIEW_INTERVAL_MS) return;
            lastPreviewEmitAt = now;

            byte[] nv21 = yuv420ToNv21(image);
            YuvImage yuvImage = new YuvImage(nv21, ImageFormat.NV21, image.getWidth(), image.getHeight(), null);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            yuvImage.compressToJpeg(new Rect(0, 0, image.getWidth(), image.getHeight()), PREVIEW_JPEG_QUALITY, out);

            JSObject frame = new JSObject();
            frame.put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            frame.put("width", image.getWidth());
            frame.put("height", image.getHeight());
            notifyListeners("frame", frame);
        } catch (Exception error) {
            // one lost preview frame is not worth reporting - the next one is a moment away
        } finally {
            image.close();
        }
    }

    private void onStillImage(ImageReader reader) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            ByteBuffer buffer = image.getPlanes()[0].getBuffer();
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);

            PluginCall call = pendingCapture;
            pendingCapture = null;
            if (call != null) {
                JSObject result = new JSObject();
                result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                result.put("mime", "image/jpeg");
                result.put("width", image.getWidth());
                result.put("height", image.getHeight());
                call.resolve(result);
            }
        } finally {
            image.close();
        }
    }

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

    /**
     * Among the physical sensors behind a logical camera, the one with the longest focal
     * length - the main wide lens, never the ultra-wide the HAL likes to switch to. Any
     * physical id that fails to resolve (a stale list) is simply skipped.
     */
    private String pickPhysicalId(CameraManager manager, CameraCharacteristics logicalChars) {
        Set<String> physicalIds = logicalChars.getPhysicalCameraIds();
        String best = null;
        float bestFocal = -1f;
        for (String id : physicalIds) {
            try {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                float[] focalLengths = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                float focal = (focalLengths != null && focalLengths.length > 0) ? focalLengths[0] : 0f;
                if (focal > bestFocal) {
                    bestFocal = focal;
                    best = id;
                }
            } catch (Exception ignored) {
                // this one physical id is unusable - the others are still tried
            }
        }
        return best;
    }

    private Size pickPreviewSize(Size[] sizes) {
        Size best = null;
        for (Size size : sizes) {
            if (size.getWidth() > PREVIEW_MAX_WIDTH) continue;
            if (best == null || (long) size.getWidth() * size.getHeight() > (long) best.getWidth() * best.getHeight()) {
                best = size;
            }
        }
        return best != null ? best : pickLargestSize(sizes);
    }

    private Size pickLargestSize(Size[] sizes) {
        Size best = sizes[0];
        for (Size size : sizes) {
            if ((long) size.getWidth() * size.getHeight() > (long) best.getWidth() * best.getHeight()) best = size;
        }
        return best;
    }

    /**
     * Degrees to rotate the JPEG by so it comes out upright. The device rotation and the
     * sensor's own mounting angle both play in; this is the formula Android's own Camera2
     * sample uses for a back-facing sensor.
     */
    private int computeJpegOrientation(CameraCharacteristics characteristics) {
        Integer sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
        int deviceRotation = currentDisplayRotationDegrees();
        return ((sensorOrientation == null ? 0 : sensorOrientation) + deviceRotation) % 360;
    }

    private int currentDisplayRotationDegrees() {
        if (getActivity() == null || getActivity().getWindowManager() == null) return 0;
        int rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
        return DISPLAY_ROTATION_DEGREES.get(rotation, 0);
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

    private JSObject errorPayload(String message) {
        JSObject payload = new JSObject();
        payload.put("message", message);
        return payload;
    }

    private void startBackgroundThread() {
        if (backgroundThread != null) return;
        backgroundThread = new HandlerThread("NativeCam");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void stopBackgroundThread() {
        if (backgroundThread == null) return;
        backgroundThread.quitSafely();
        try {
            backgroundThread.join();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
        backgroundThread = null;
        backgroundHandler = null;
    }

    private void closeCamera() {
        try {
            if (captureSession != null) captureSession.close();
        } catch (Exception ignored) {
            // closing over an already-broken session is not worth reporting
        }
        captureSession = null;
        try {
            if (cameraDevice != null) cameraDevice.close();
        } catch (Exception ignored) {
            // same here - the device is going away either way
        }
        cameraDevice = null;
        if (previewReader != null) {
            previewReader.close();
            previewReader = null;
        }
        if (stillReader != null) {
            stillReader.close();
            stillReader = null;
        }
        pendingCapture = null;
        physicalCameraId = null;
        stopBackgroundThread();
    }
}
