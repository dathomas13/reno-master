/**
 * The native camera path (APK only) - see plugins/nativecam/README.md for why it exists.
 *
 * Web keeps using platform/camera.ts and getUserMedia unchanged; there is no equivalent to
 * Camera2's physical-sensor binding in a browser. On native, CameraCapture prefers this
 * plugin and falls back to getUserMedia only if isSupported() says no (old Android, or no
 * back camera at all).
 */
import { isNative } from './index';
import { base64ToBlob } from './photos';

export interface NativeCamFrame {
  base64: string;
  width: number;
  height: number;
}

interface NativeCamPlugin {
  isSupported(): Promise<{ supported: boolean; reason?: string }>;
  start(): Promise<{ physicalCameraId?: string }>;
  capture(): Promise<{ base64: string; mime: string; width: number; height: number }>;
  stop(): Promise<void>;
  addListener(event: 'frame', handler: (frame: NativeCamFrame) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: 'error', handler: (error: { message: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

function plugin(): NativeCamPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.NativeCam as NativeCamPlugin | undefined) ?? null;
}

let supportCache: Promise<boolean> | null = null;

/** cached: the check itself opens no camera, but there is no reason to ask twice a session */
export function nativeCameraSupported(): Promise<boolean> {
  if (!isNative() || !plugin()) return Promise.resolve(false);
  if (!supportCache) {
    supportCache = plugin()!
      .isSupported()
      .then((result) => result.supported)
      .catch(() => false);
  }
  return supportCache;
}

export interface NativeCameraSession {
  physicalCameraId?: string;
  onFrame(handler: (frame: NativeCamFrame) => void): () => void;
  onError(handler: (message: string) => void): () => void;
  capture(): Promise<Blob>;
  close(): Promise<void>;
}

/** opens the native camera; rejects like the plugin does, the caller decides what the user sees */
export async function openNativeCamera(): Promise<NativeCameraSession> {
  const native = plugin();
  if (!native) throw new Error('Kein Zugriff auf die native Kamera');

  const { physicalCameraId } = await native.start();
  let closed = false;

  return {
    physicalCameraId,
    onFrame(handler) {
      const pending = native.addListener('frame', handler);
      return () => void pending.then((handle) => handle.remove());
    },
    onError(handler) {
      const pending = native.addListener('error', (error) => handler(error.message));
      return () => void pending.then((handle) => handle.remove());
    },
    async capture() {
      const { base64, mime } = await native.capture();
      return base64ToBlob(base64, mime);
    },
    async close() {
      if (closed) return;
      closed = true;
      await native.stop();
    },
  };
}
