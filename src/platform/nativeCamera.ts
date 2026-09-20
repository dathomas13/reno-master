/**
 * The native camera path (APK only) - see plugins/nativecam/README.md for why it exists.
 *
 * Web keeps using platform/camera.ts and getUserMedia unchanged; there is no equivalent to
 * Camera2's physical-sensor binding in a browser. On native, CameraCapture prefers this
 * plugin and falls back to getUserMedia when isSupported() says no, when start() fails, and
 * - the reason for the timeouts below - when the plugin stops answering at all. A camera
 * that hangs has to end up in the fallback too, never in a spinner that never stops.
 */
import { isNative } from './index';
import { base64ToBlob } from './photos';
import { cameraLog } from './cameraLog';

export interface NativeCamFrame {
  base64: string;
  width: number;
  height: number;
}

/** the plugin tries one lens after another, so opening is allowed to take a few seconds */
const START_TIMEOUT_MS = 15000;
const CAPTURE_TIMEOUT_MS = 5000;

/**
 * On the device Capacitor hands the listener handle back directly, not as a promise, and
 * remove() returns nothing - so everything from the bridge goes through Promise.resolve
 * before it is treated as one. Getting this wrong cost a working camera once already: the
 * .then() on a plain handle threw, and the failing close() never reached stop(), which left
 * the camera open and made getUserMedia fail too.
 */
type FromBridge<T> = T | Promise<T>;

interface Listener {
  remove: () => FromBridge<void>;
}

interface NativeCamPlugin {
  isSupported(): Promise<{ supported: boolean; reason?: string }>;
  start(): Promise<{ physicalCameraId?: string }>;
  capture(): Promise<{ base64: string; mime: string; width: number; height: number }>;
  stop(): Promise<void>;
  addListener(event: 'frame', handler: (frame: NativeCamFrame) => void): FromBridge<Listener>;
  addListener(event: 'error', handler: (error: { message: string }) => void): FromBridge<Listener>;
  addListener(event: 'log', handler: (entry: { message: string }) => void): FromBridge<Listener>;
}

function removeQuietly(handle: Listener): Promise<void> {
  return Promise.resolve(handle.remove()).catch(() => undefined);
}

function plugin(): NativeCamPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.NativeCam as NativeCamPlugin | undefined) ?? null;
}

/** exported for its own test: a hang is the failure mode this whole file guards against */
export function withTimeout<T>(work: FromBridge<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} meldet sich seit ${ms / 1000}s nicht`)), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

let supportCache: Promise<boolean> | null = null;
let givenUp = false;

/**
 * Cached: the check itself opens no camera, but there is no reason to ask twice a session.
 *
 * Once opening has failed outright it stays failed for the rest of the app's run. On the
 * device this matters more than it sounds: every failed open leaves the camera service worse
 * off, and a second run of the same doomed attempt would wreck getUserMedia's chances too.
 */
export function giveUpOnNativeCamera(): void {
  givenUp = true;
}

export function nativeCameraSupported(): Promise<boolean> {
  if (givenUp || !isNative() || !plugin()) return Promise.resolve(false);
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

  // attached before start(), so which lenses exist and what each one did lands in the
  // protocol - that is the only thing left to read when the camera takes the app with it
  const logging = await Promise.resolve(
    native.addListener('log', ({ message }) => cameraLog(`nativ: ${message}`)),
  );

  let opened: { physicalCameraId?: string };
  try {
    opened = await withTimeout(native.start(), START_TIMEOUT_MS, 'Die Kamera');
  } catch (cause) {
    givenUp = true; // see nativeCameraSupported: a second attempt only damages the camera further
    await removeQuietly(logging);
    await native.stop().catch(() => undefined);
    throw cause;
  }

  const handles: Listener[] = [logging];
  let closed = false;

  function listen(source: FromBridge<Listener>): () => void {
    const pending = Promise.resolve(source);
    void pending.then((handle) => {
      if (closed) void removeQuietly(handle);
      else handles.push(handle);
    });
    return () => void pending.then(removeQuietly);
  }

  return {
    physicalCameraId: opened.physicalCameraId,
    onFrame(handler) {
      return listen(native.addListener('frame', handler));
    },
    onError(handler) {
      return listen(native.addListener('error', (error) => handler(error.message)));
    },
    async capture() {
      const { base64, mime } = await withTimeout(native.capture(), CAPTURE_TIMEOUT_MS, 'Die Aufnahme');
      return base64ToBlob(base64, mime);
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await Promise.all(handles.map(removeQuietly));
      } finally {
        // the camera has to be let go whatever else went wrong: while the plugin holds it,
        // getUserMedia cannot have it either and answers NotReadableError
        await native.stop();
      }
    },
  };
}
