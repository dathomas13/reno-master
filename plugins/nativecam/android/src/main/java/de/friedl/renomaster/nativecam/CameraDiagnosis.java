package de.friedl.renomaster.nativecam;

import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Range;
import android.util.Size;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Tries a matrix of camera configurations one after another and writes down what each did.
 *
 * This restarted the phone once - the whole phone, not the app - and what the report said
 * afterwards changed the picture completely. The run died on the very first probe: the FRONT
 * camera, the healthy one, at 640x480, with default settings. Not the broken rear camera, not
 * after a cascade of failed opens, but on the first clean touch.
 *
 * The only thing about that configuration that had never run on this device before was the
 * buffer format: ImageFormat.PRIVATE, which is what an ordinary camera app hands to the
 * display, as opposed to the CPU-readable YUV that this app and the browser have always used.
 * So the suspect is no longer the camera at all - it is the format, on any camera.
 *
 * Which is why the order here is what it is:
 *
 * - checkBuffers() allocates each format with no camera involved whatsoever. If PRIVATE alone
 *   is fatal, four lines prove it and nothing needs to be opened.
 * - The probe list runs YUV on every camera first - that is what the app does daily and what
 *   every surviving log used - and only then PRIVATE, ending with the exact configuration that
 *   took the device down, which the skip logic will drop anyway on the run after it dies.
 * - Every step inside a probe writes what it is about to do before doing it, and a heartbeat
 *   runs while it streams, so a death can be placed to the individual call rather than to a
 *   six-second window.
 *
 * Everything goes through say(), which puts the line on the disk with an fsync before it
 * reaches the live view. A run that takes the device down can still tell us what it was doing.
 */
final class CameraDiagnosis {

    interface Sink {
        void log(String line);
    }

    /** how long each configuration is watched before it counts as survived */
    private static final long PROBE_MS = 6000;
    /** the camera service needs a moment between attempts, see NativeCamPlugin */
    private static final long PAUSE_MS = 4000;
    /** switching sensor asks the most of the camera board, so it gets the longest rest */
    private static final long SWITCH_PAUSE_MS = 8000;
    /** how long close() is given to actually release the camera before we stop */
    private static final long CLOSE_TIMEOUT_MS = 3000;

    private final CameraManager manager;
    private final Sink events;
    private final DiagnosisLog disk;
    /** cleared the moment the hardware faults, and never set again for this run */
    private final java.util.concurrent.atomic.AtomicBoolean safeToGoOn =
        new java.util.concurrent.atomic.AtomicBoolean(true);

    CameraDiagnosis(CameraManager manager, Sink events, DiagnosisLog disk) {
        this.manager = manager;
        this.events = events;
        this.disk = disk;
    }

    /**
     * Every line goes to the file first, with an fsync, and only then to the live view. When
     * the phone dies mid-probe, whatever was said last is on the disk - that is the only way
     * a run that takes the device down can still tell us which configuration did it.
     */
    private void say(String line) {
        disk.line(line);
        events.log(line);
    }

    private static final String BEGIN = ">>> LAUF ";
    private static final String END = "<<< LAUF ";

    void run() throws Exception {
        // read the previous run before anything overwrites it: if it stops mid-probe, that
        // probe is what took the phone down, and it is not getting a second chance
        String victim = unfinishedProbeOfLastRun();
        disk.clear();

        say("════════ Vollprüfung startet");
        if (victim != null) {
            say("⚠ Der letzte Lauf endete mitten in: " + victim);
            say("⚠ Genau diese Einstellung wird übersprungen – sie hat vermutlich das Gerät umgelegt");
        }
        String[] ids = manager.getCameraIdList();
        say("Kameras des Geräts: " + join(Arrays.asList(ids)));

        for (String id : ids) {
            describe(id);
        }

        checkBuffers();

        List<Probe> probes = buildProbes(ids);
        say("──────── " + probes.size() + " Durchläufe, je bis zu " + (PROBE_MS / 1000) + "s");
        int number = 0;
        String previousCamera = null;
        for (Probe probe : probes) {
            number += 1;
            if (!safeToGoOn.get()) {
                say("✖ Die Kamera hat sich verabschiedet – Rest der Prüfung entfällt");
                break;
            }
            if (!serviceAlive(probe.cameraId)) {
                say("✖ Kamera " + probe.cameraId + " antwortet nicht mehr – Rest der Prüfung entfällt");
                break;
            }
            if (probe.key().equals(victim)) {
                say("⏭ übersprungen: " + probe.label);
                continue;
            }
            if (previousCamera != null && !previousCamera.equals(probe.cameraId)) {
                // changing sensor is the most demanding thing there is for the camera board
                say("   (Sensorwechsel – " + (SWITCH_PAUSE_MS / 1000) + "s Pause)");
                Thread.sleep(SWITCH_PAUSE_MS);
            }
            // said, and on the disk, BEFORE the camera is touched
            say(BEGIN + number + " " + probe.key() + " – " + probe.label);
            probe(number, probe);
            say(END + number + " " + probe.key());
            previousCamera = probe.cameraId;
            Thread.sleep(PAUSE_MS);
        }
        say("════════ Vollprüfung fertig");
    }

    /**
     * Allocates each buffer format on its own, with no camera involved at all.
     *
     * The run that restarted the phone died on the very first probe - the front camera, the
     * healthy one, in PRIVATE format. That rules out the broken rear camera and rules out any
     * cascade, and leaves the format itself as the suspect. If merely making a PRIVATE buffer
     * queue is enough to take the device down, the camera is innocent entirely, and these four
     * lines say so without opening anything.
     */
    private void checkBuffers() {
        for (int format : new int[] { ImageFormat.YUV_420_888, ImageFormat.PRIVATE }) {
            say(">>> PUFFER " + formatName(format) + " 640×480 – ohne Kamera");
            ImageReader reader = null;
            try {
                reader = ImageReader.newInstance(640, 480, format, 3);
                say("   → angelegt, hole Surface");
                reader.getSurface();
                say("   ✓ Surface steht");
            } catch (Throwable error) {
                say("   ✖ " + error);
            } finally {
                if (reader != null) reader.close();
                say("<<< PUFFER " + formatName(format));
            }
        }
    }

    /**
     * The probe the last run started and never finished, if any. That is the whole reason the
     * report is written with an fsync per line: after the phone restarts, this sentence is the
     * only witness left.
     */
    private String unfinishedProbeOfLastRun() {
        String started = null;
        for (String line : disk.read()) {
            int begin = line.indexOf(BEGIN);
            if (begin >= 0) {
                started = keyOf(line.substring(begin + BEGIN.length()));
                continue;
            }
            int end = line.indexOf(END);
            if (end >= 0 && started != null && started.equals(keyOf(line.substring(end + END.length())))) {
                started = null;
            }
        }
        return started;
    }

    /** "3 cam0/PRIVATE/roh/1280 – Kamera 0, ..." -> "cam0/PRIVATE/roh/1280" */
    private String keyOf(String rest) {
        String[] words = rest.trim().split("\\s+");
        return words.length >= 2 ? words[1] : null;
    }

    // ---------------------------------------------------------------- what the device claims

    private void describe(String id) {
        try {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            say("── Kamera " + id + " (" + facing(chars) + ")");
            say("   Güteklasse: " + hardwareLevel(chars));
            say("   Fähigkeiten: " + capabilities(chars));
            properties(chars);
        } catch (Exception error) {
            say("── Kamera " + id + ": nicht lesbar – " + error);
        }
    }

    /** the properties worth knowing per camera, kept apart so describe() stays readable */
    private void properties(CameraCharacteristics chars) {
        Size pixels = chars.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
        float[] focal = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        float[] apertures = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES);
        Float minFocus = chars.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
        Integer orientation = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
        Range<Integer> iso = chars.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
        Range<Long> exposure = chars.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
        Integer timestamps = chars.get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE);
        Integer maxOis = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION) == null
            ? null : chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION).length;

        say("   Sensor: " + (pixels == null ? "?" : pixels.getWidth() + "×" + pixels.getHeight())
            + ", Ausrichtung " + orientation
            + ", Brennweiten " + floats(focal)
            + ", Blenden " + floats(apertures)
            + ", Nahgrenze " + minFocus);
        say("   Belichtung: ISO " + iso + ", Zeit " + exposure + ", Zeitquelle " + timestamps);
        say("   Fokusarten: " + ints(chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES))
            + ", Bildstabilisator-Arten: " + maxOis);
        say("   Bildraten: " + ranges(chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)));

        try {
            say("   Einzelne Linsen: " + join(new ArrayList<>(chars.getPhysicalCameraIds())));
        } catch (Throwable ignored) {
            say("   Einzelne Linsen: keine");
        }

        StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        if (map == null) {
            say("   ✖ nennt keine Ausgabeformate");
            return;
        }
        say("   Größen YUV: " + sizes(map.getOutputSizes(ImageFormat.YUV_420_888)));
        say("   Größen JPEG: " + sizes(map.getOutputSizes(ImageFormat.JPEG)));
        say("   Größen intern (PRIVATE): " + sizes(map.getOutputSizes(ImageFormat.PRIVATE)));
    }

    // ---------------------------------------------------------------- the matrix

    private static final class Probe {
        final String cameraId;
        final int format;
        final boolean tame;
        final int maxEdge;
        final String label;

        Probe(String cameraId, int format, boolean tame, int maxEdge, String label) {
            this.cameraId = cameraId;
            this.format = format;
            this.tame = tame;
            this.maxEdge = maxEdge;
            this.label = label;
        }

        /** stable across runs, so a probe that killed the phone can be recognised next time */
        String key() {
            return "cam" + cameraId
                + "/" + (format == ImageFormat.PRIVATE ? "PRIVATE" : "YUV")
                + "/" + (tame ? "zahm" : "roh")
                + "/" + maxEdge;
        }
    }

    /**
     * Front camera first: it worked in every earlier log, so if it fails here the harness is
     * at fault rather than the rear hardware. Then the rear cameras, display-format before
     * readable-format, because that is the untested difference.
     */
    private List<Probe> buildProbes(String[] ids) {
        List<Probe> probes = new ArrayList<>();
        String front = firstFacing(ids, CameraMetadata.LENS_FACING_FRONT);

        // Known-survivable first: YUV is what the app uses every day and what the browser used
        // in every log. PRIVATE goes last throughout, because the one run that took the phone
        // down did it on PRIVATE - on the healthy front camera, on the first touch.
        if (front != null) {
            probes.add(new Probe(front, ImageFormat.YUV_420_888, false, 640,
                "Frontkamera " + front + ", lesbares Format – Gegenprobe"));
        }
        for (String id : ids) {
            if (!isFacing(id, CameraMetadata.LENS_FACING_BACK)) continue;
            probes.add(new Probe(id, ImageFormat.YUV_420_888, false, 1280,
                "Kamera " + id + ", lesbares Format, Standard"));
            probes.add(new Probe(id, ImageFormat.YUV_420_888, true, 640,
                "Kamera " + id + ", lesbares Format, klein und langsam – bisheriger Weg"));
        }
        for (String id : ids) {
            if (!isFacing(id, CameraMetadata.LENS_FACING_BACK)) continue;
            probes.add(new Probe(id, ImageFormat.PRIVATE, true, 640,
                "Kamera " + id + ", internes Format, klein und langsam – VERDÄCHTIG"));
            probes.add(new Probe(id, ImageFormat.PRIVATE, false, 1280,
                "Kamera " + id + ", internes Format, Standard – VERDÄCHTIG"));
        }
        if (front != null) {
            probes.add(new Probe(front, ImageFormat.PRIVATE, false, 640,
                "Frontkamera " + front + ", internes Format – das war der Übeltäter"));
        }
        return probes;
    }

    private void probe(int number, Probe probe) {
        say("──────── " + number + ") " + probe.label);

        HandlerThread thread = new HandlerThread("diagnose-" + number);
        thread.start();
        Handler handler = new Handler(thread.getLooper());

        AtomicReference<CameraDevice> device = new AtomicReference<>();
        AtomicReference<CameraCaptureSession> session = new AtomicReference<>();
        AtomicReference<String> outcome = new AtomicReference<>();
        AtomicInteger frames = new AtomicInteger();
        AtomicLong firstFrameAt = new AtomicLong();
        CountDownLatch finished = new CountDownLatch(1);
        CountDownLatch closed = new CountDownLatch(1);
        long started = System.currentTimeMillis();
        ImageReader reader = null;

        try {
            CameraCharacteristics chars = manager.getCameraCharacteristics(probe.cameraId);
            StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size[] sizes = map == null ? null : map.getOutputSizes(probe.format);
            if (sizes == null || sizes.length == 0) {
                say("   ✖ dieses Format bietet die Kamera nicht an");
                return;
            }
            Size size = pick(sizes, probe.maxEdge);
            say("   Strom " + size.getWidth() + "×" + size.getHeight());

            say("   → lege Puffer an (" + formatName(probe.format) + ")");
            reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), probe.format, 3);
            say("   → Puffer steht, hole Surface");
            final ImageReader open = reader;
            open.getSurface();
            say("   → Surface steht");
            reader.setOnImageAvailableListener(source -> {
                Image image = source.acquireLatestImage();
                if (image == null) return;
                if (frames.incrementAndGet() == 1) firstFrameAt.set(System.currentTimeMillis());
                image.close();
            }, handler);

            say("   → rufe openCamera(" + probe.cameraId + ")");
            manager.openCamera(probe.cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice opened) {
                    device.set(opened);
                    say("   → Gerät offen, lege Sitzung an");
                    try {
                        opened.createCaptureSession(
                            java.util.Collections.singletonList(open.getSurface()),
                            new CameraCaptureSession.StateCallback() {
                                @Override
                                public void onConfigured(CameraCaptureSession configured) {
                                    session.set(configured);
                                    say("   → Sitzung steht, fordere Vorschau an");
                                    try {
                                        CaptureRequest.Builder builder =
                                            opened.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                        builder.addTarget(open.getSurface());
                                        if (probe.tame) tame(builder, chars);
                                        configured.setRepeatingRequest(builder.build(), null, handler);
                                        say("   → Vorschau angefordert");
                                    } catch (Exception error) {
                                        outcome.compareAndSet(null, "Vorschau nicht zu starten: " + error);
                                        finished.countDown();
                                    }
                                }

                                @Override
                                public void onConfigureFailed(CameraCaptureSession configured) {
                                    outcome.compareAndSet(null, "Sitzung abgelehnt");
                                    finished.countDown();
                                }
                            }, handler);
                    } catch (Exception error) {
                        outcome.compareAndSet(null, "Sitzung nicht aufzubauen: " + error);
                        finished.countDown();
                    }
                }

                @Override
                public void onClosed(CameraDevice opened) {
                    closed.countDown();
                }

                @Override
                public void onDisconnected(CameraDevice opened) {
                    outcome.compareAndSet(null, "getrennt");
                    safeToGoOn.set(false);
                    finished.countDown();
                }

                @Override
                public void onError(CameraDevice opened, int error) {
                    outcome.compareAndSet(null, "Kamera-Fehler " + error + " (" + errorName(error) + ")");
                    // a fault in the camera itself: everything after this would be hitting
                    // hardware that is already down, which is how the phone got rebooted
                    if (error == CameraDevice.StateCallback.ERROR_CAMERA_DEVICE
                        || error == CameraDevice.StateCallback.ERROR_CAMERA_SERVICE) {
                        safeToGoOn.set(false);
                    }
                    finished.countDown();
                }
            }, handler);

            say("   → openCamera abgesetzt, beobachte " + (PROBE_MS / 1000) + "s");
            boolean died = false;
            long deadline = System.currentTimeMillis() + PROBE_MS;
            while (System.currentTimeMillis() < deadline) {
                if (finished.await(1000, TimeUnit.MILLISECONDS)) {
                    died = true;
                    break;
                }
                say("   → lebt " + ((System.currentTimeMillis() - started) / 1000) + "s, "
                    + frames.get() + " Bilder");
            }
            long lived = System.currentTimeMillis() - started;
            String firstFrame = firstFrameAt.get() == 0
                ? "nie ein Bild"
                : "erstes Bild nach " + (firstFrameAt.get() - started) + " ms";
            if (died) {
                say("   ✖ " + outcome.get() + " nach " + lived + " ms, " + frames.get()
                    + " Bilder, " + firstFrame);
            } else {
                say("   ✓ hat " + lived + " ms durchgehalten, " + frames.get()
                    + " Bilder, " + firstFrame);
            }
        } catch (Exception error) {
            say("   ✖ Durchlauf abgebrochen: " + error);
        } finally {
            CameraCaptureSession configured = session.get();
            if (configured != null) {
                try {
                    configured.close();
                } catch (Exception ignored) {
                    // a session that is already gone needs no closing
                }
            }
            CameraDevice opened = device.get();
            if (opened != null) {
                try {
                    opened.close();
                    // close() only asks; the camera is free when onClosed says so. Waiting here
                    // is the whole point: the first version went straight on to open the next
                    // camera while this one - usually mid-fault - was still coming down, and
                    // quit the very thread onClosed would have arrived on.
                    if (!closed.await(CLOSE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                        say("   ⚠ Kamera hat das Schließen nicht bestätigt – Prüfung endet hier");
                        safeToGoOn.set(false);
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    safeToGoOn.set(false);
                } catch (Exception ignored) {
                    // same
                }
            }
            // only now, with the device gone, can the camera no longer hold buffers from it
            if (reader != null) reader.close();
            thread.quitSafely();
        }
    }

    /** the settings that made the least difference so far, kept so the table stays complete */
    private void tame(CaptureRequest.Builder builder, CameraCharacteristics chars) {
        Range<Integer>[] ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        if (ranges != null && ranges.length > 0) {
            Range<Integer> slowest = ranges[0];
            for (Range<Integer> range : ranges) {
                if (range.getUpper() < slowest.getUpper()) slowest = range;
            }
            builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, slowest);
        }
        if (offers(chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES),
            CameraMetadata.CONTROL_AF_MODE_OFF)) {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF);
        }
        if (offers(chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION),
            CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON)) {
            builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_OFF);
        }
        builder.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
            CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
    }

    // ---------------------------------------------------------------- helpers

    /** asks about the camera that is about to be used, not just about any camera */
    private boolean serviceAlive(String cameraId) {
        try {
            manager.getCameraCharacteristics(cameraId);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private String formatName(int format) {
        if (format == ImageFormat.PRIVATE) return "PRIVATE";
        if (format == ImageFormat.YUV_420_888) return "YUV";
        if (format == ImageFormat.JPEG) return "JPEG";
        return String.valueOf(format);
    }

    private boolean offers(int[] values, int wanted) {
        if (values == null) return false;
        for (int value : values) {
            if (value == wanted) return true;
        }
        return false;
    }

    private boolean isFacing(String id, int wanted) {
        try {
            Integer facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
            return facing != null && facing == wanted;
        } catch (Exception error) {
            return false;
        }
    }

    private String firstFacing(String[] ids, int wanted) {
        for (String id : ids) {
            if (isFacing(id, wanted)) return id;
        }
        return null;
    }

    private String facing(CameraCharacteristics chars) {
        Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
        if (facing == null) return "unbekannt";
        if (facing == CameraMetadata.LENS_FACING_BACK) return "hinten";
        if (facing == CameraMetadata.LENS_FACING_FRONT) return "vorne";
        return "extern";
    }

    private String hardwareLevel(CameraCharacteristics chars) {
        Integer level = chars.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL);
        if (level == null) return "unbekannt";
        switch (level) {
            case CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY: return "LEGACY";
            case CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED: return "LIMITED";
            case CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_FULL: return "FULL";
            case CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_3: return "LEVEL_3";
            default: return "EXTERNAL/" + level;
        }
    }

    private String capabilities(CameraCharacteristics chars) {
        return ints(chars.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES));
    }

    private String errorName(int error) {
        switch (error) {
            case CameraDevice.StateCallback.ERROR_CAMERA_IN_USE: return "schon in Benutzung";
            case CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE: return "zu viele offen";
            case CameraDevice.StateCallback.ERROR_CAMERA_DISABLED: return "abgeschaltet";
            case CameraDevice.StateCallback.ERROR_CAMERA_DEVICE: return "Kamera selbst ausgefallen";
            case CameraDevice.StateCallback.ERROR_CAMERA_SERVICE: return "Kameradienst ausgefallen";
            default: return "unbekannt";
        }
    }

    private Size pick(Size[] sizes, int maxEdge) {
        Size best = null;
        Size smallest = sizes[0];
        for (Size size : sizes) {
            if ((long) size.getWidth() * size.getHeight() < (long) smallest.getWidth() * smallest.getHeight()) {
                smallest = size;
            }
            if (Math.max(size.getWidth(), size.getHeight()) > maxEdge) continue;
            if (best == null
                || (long) size.getWidth() * size.getHeight() > (long) best.getWidth() * best.getHeight()) {
                best = size;
            }
        }
        return best != null ? best : smallest;
    }

    private String sizes(Size[] sizes) {
        if (sizes == null || sizes.length == 0) return "keine";
        Size smallest = sizes[0];
        Size largest = sizes[0];
        for (Size size : sizes) {
            long area = (long) size.getWidth() * size.getHeight();
            if (area < (long) smallest.getWidth() * smallest.getHeight()) smallest = size;
            if (area > (long) largest.getWidth() * largest.getHeight()) largest = size;
        }
        return sizes.length + " Stück, von " + smallest.getWidth() + "×" + smallest.getHeight()
            + " bis " + largest.getWidth() + "×" + largest.getHeight();
    }

    private String ints(int[] values) {
        if (values == null) return "keine";
        List<String> parts = new ArrayList<>();
        for (int value : values) parts.add(String.valueOf(value));
        return join(parts);
    }

    private String floats(float[] values) {
        if (values == null) return "keine";
        List<String> parts = new ArrayList<>();
        for (float value : values) parts.add(String.valueOf(value));
        return join(parts);
    }

    private String ranges(Range<Integer>[] values) {
        if (values == null) return "keine";
        List<String> parts = new ArrayList<>();
        for (Range<Integer> value : values) parts.add(value.getLower() + "–" + value.getUpper());
        return join(parts);
    }

    private String join(List<String> parts) {
        StringBuilder text = new StringBuilder();
        for (String part : parts) {
            if (text.length() > 0) text.append(", ");
            text.append(part);
        }
        return text.length() == 0 ? "keine" : text.toString();
    }
}
