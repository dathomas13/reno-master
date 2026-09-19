/**
 * The in-app camera, an alternative to handing the shot off to the system camera app.
 *
 * Why this exists: the system camera app probes every lens on start-up, and a phone with
 * one broken lens crashes right there, before a photo can be taken. `getUserMedia` lets
 * this app open exactly one named lens instead, so a broken one can simply be avoided.
 *
 * The catch: Samsung's "camera2 0" is a logical camera that quietly switches to the
 * ultra-wide for close focus and zoom below 1×. If that is the broken lens, the switch
 * takes the camera service down two seconds in. The experiments below try to pin zoom and
 * focus so the switch never happens; everything they do lands in the camera protocol.
 */
import type { LocalSettings } from '@/lib/settings';
import { cameraLog } from './cameraLog';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface CameraOptions {
  /** a specific lens; undefined falls back to the back camera */
  deviceId?: string;
  lockZoom: boolean;
  fixedFocus: boolean;
  resolution: LocalSettings['cameraResolution'];
}

export function cameraOptionsFromSettings(settings: LocalSettings): CameraOptions {
  return {
    deviceId: settings.cameraDeviceId || undefined,
    lockZoom: settings.cameraLockZoom,
    fixedFocus: settings.cameraFixedFocus,
    resolution: settings.cameraResolution,
  };
}

export function customCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Every camera the device reports. Labels are empty until permission was granted once,
 * so this asks for it - briefly, and the stream is closed again right away - the first
 * time it is called without labels.
 */
export async function listCameraDevices(): Promise<CameraDeviceOption[]> {
  if (!customCameraSupported()) return [];
  let cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  if (cams.some((cam) => !cam.label)) {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((track) => track.stop());
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      // permission refused - the unlabelled list below is still better than nothing
    }
  }
  const devices = cams.map((cam, index) => ({ deviceId: cam.deviceId, label: cam.label || `Kamera ${index + 1}` }));
  cameraLog(`Kameras gefunden: ${devices.map((d) => `${d.label} [${d.deviceId.slice(0, 8)}]`).join(', ') || 'keine'}`);
  return devices;
}

// The image-capture constraints (zoom, focus) are not in lib.dom yet.
interface ExtendedCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
}
interface ExtendedSettings extends MediaTrackSettings {
  zoom?: number;
  focusMode?: string;
  focusDistance?: number;
}

export function buildConstraints(options: CameraOptions): MediaStreamConstraints {
  const video: MediaTrackConstraints = options.deviceId
    ? { deviceId: { exact: options.deviceId } }
    : { facingMode: 'environment' };
  if (options.resolution === 'hd') {
    video.width = { ideal: 1920 };
    video.height = { ideal: 1080 };
  } else if (options.resolution === 'max') {
    video.width = { ideal: 4096 };
    video.height = { ideal: 3072 };
  }
  return { audio: false, video };
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return '–';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function describeTrack(track: MediaStreamTrack): string {
  const s = track.getSettings() as ExtendedSettings;
  return (
    `${track.label || 'ohne Label'} ${s.width ?? '?'}×${s.height ?? '?'} ` +
    `fps=${fmt(s.frameRate)} facing=${fmt(s.facingMode)} zoom=${fmt(s.zoom)} ` +
    `focus=${fmt(s.focusMode)}/${fmt(s.focusDistance)} muted=${track.muted} state=${track.readyState}`
  );
}

function capabilitiesOf(track: MediaStreamTrack): ExtendedCapabilities {
  try {
    return track.getCapabilities() as ExtendedCapabilities;
  } catch {
    return {};
  }
}

/**
 * Opens the camera the way the settings ask for it and writes every step to the protocol.
 * Rejects like getUserMedia does; the caller decides what the user sees.
 */
export async function openCamera(options: CameraOptions): Promise<MediaStream> {
  const constraints = buildConstraints(options);
  cameraLog(`getUserMedia ${JSON.stringify(constraints.video)}`);
  const started = Date.now();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; constraint?: string };
    cameraLog(`✖ getUserMedia scheitert nach ${Date.now() - started} ms: ${error.name ?? ''} ${error.message ?? ''} ${error.constraint ?? ''}`);
    throw cause;
  }
  const track = stream.getVideoTracks()[0];
  cameraLog(`Stream nach ${Date.now() - started} ms: ${track ? describeTrack(track) : 'ohne Videospur'}`);
  if (!track) return stream;

  const caps = capabilitiesOf(track);
  cameraLog(
    `Fähigkeiten: zoom=${fmt(caps.zoom)} focusMode=${fmt(caps.focusMode)} focusDistance=${fmt(caps.focusDistance)} ` +
      `width=${fmt(caps.width)} height=${fmt(caps.height)} facing=${fmt(caps.facingMode)}`,
  );

  const advanced: Record<string, unknown>[] = [];
  if (options.lockZoom) {
    if (caps.zoom) {
      // 1× is where the main lens sits; anything below hands over to the ultra-wide
      const zoom = Math.min(Math.max(1, caps.zoom.min), caps.zoom.max);
      advanced.push({ zoom });
    } else {
      cameraLog('Zoom festhalten: Gerät bietet keinen Zoom über die Spur an');
    }
  }
  if (options.fixedFocus) {
    if (caps.focusMode?.includes('manual') && caps.focusDistance) {
      // roughly a metre away, well clear of the macro range that triggers the switch
      const { min, max } = caps.focusDistance;
      const distance = Math.min(Math.max(1, min), max);
      advanced.push({ focusMode: 'manual', focusDistance: distance });
    } else if (caps.focusMode?.length) {
      // no manual focus: at least stop the continuous hunt that lands in macro range
      const mode = caps.focusMode.includes('single-shot') ? 'single-shot' : caps.focusMode[0];
      advanced.push({ focusMode: mode });
    } else {
      cameraLog('Fokus festhalten: Gerät bietet keinen Fokusmodus über die Spur an');
    }
  }
  if (advanced.length) {
    try {
      await track.applyConstraints({ advanced } as MediaTrackConstraints);
      cameraLog(`applyConstraints ${JSON.stringify(advanced)} angenommen → ${describeTrack(track)}`);
    } catch (cause) {
      const error = cause as { name?: string; message?: string };
      cameraLog(`✖ applyConstraints ${JSON.stringify(advanced)} abgelehnt: ${error.name ?? ''} ${error.message ?? ''}`);
    }
  }
  return stream;
}
