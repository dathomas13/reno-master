import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeCameraSupported, openNativeCamera, withTimeout } from '../nativeCamera';

function stubCapacitor(plugin: Record<string, unknown> | undefined) {
  vi.stubGlobal('Capacitor', {
    isNativePlatform: () => true,
    Plugins: plugin ? { NativeCam: plugin } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withTimeout', () => {
  it('hands the value through when the work answers', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'Die Kamera')).resolves.toBe(42);
  });

  it('gives up instead of waiting forever when nothing answers', async () => {
    await expect(withTimeout(new Promise(() => {}), 5, 'Die Kamera')).rejects.toThrow(/meldet sich/);
  });

  it('passes the original failure on', async () => {
    await expect(withTimeout(Promise.reject(new Error('Keine Linse')), 1000, 'Die Kamera')).rejects.toThrow(
      'Keine Linse',
    );
  });
});

describe('nativeCameraSupported', () => {
  it('is false without the Capacitor globals (the web build)', async () => {
    await expect(nativeCameraSupported()).resolves.toBe(false);
  });

  it('asks the plugin once it is native', async () => {
    const isSupported = vi.fn().mockResolvedValue({ supported: true });
    stubCapacitor({ isSupported });
    await expect(nativeCameraSupported()).resolves.toBe(true);
  });
});

describe('openNativeCamera', () => {
  it('rejects when there is no native plugin to talk to', async () => {
    await expect(openNativeCamera()).rejects.toThrow();
  });

  it('wires frame/error listeners and turns a capture into a Blob', async () => {
    const listeners: Record<string, (payload: unknown) => void> = {};
    const start = vi.fn().mockResolvedValue({ physicalCameraId: 'phys-1' });
    const capture = vi.fn().mockResolvedValue({ base64: btoa('jpeg-bytes'), mime: 'image/jpeg' });
    const stop = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn((event: string, handler: (payload: unknown) => void) => {
      listeners[event] = handler;
      return Promise.resolve({ remove });
    });
    stubCapacitor({ start, capture, stop, addListener });

    const session = await openNativeCamera();
    expect(session.physicalCameraId).toBe('phys-1');

    const frames: unknown[] = [];
    const offFrame = session.onFrame((frame) => frames.push(frame));
    listeners.frame({ base64: 'x', width: 10, height: 20 });
    expect(frames).toEqual([{ base64: 'x', width: 10, height: 20 }]);

    const errors: string[] = [];
    session.onError((message) => errors.push(message));
    listeners.error({ message: 'kaputt' });
    expect(errors).toEqual(['kaputt']);

    const blob = await session.capture();
    expect(blob.type).toBe('image/jpeg');

    offFrame();
    await session.close();
    await session.close(); // idempotent - a second close is not an error
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('writes what the plugin reports into the protocol, from before the camera opens', async () => {
    const lines: string[] = [];
    const start = vi.fn().mockResolvedValue({});
    const addListener = vi.fn((event: string, handler: (payload: { message: string }) => void) => {
      // the plugin reports its lens inventory while start() is still running
      if (event === 'log') handler({ message: 'Linse 2: 4080×3060' });
      return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) });
    });
    stubCapacitor({ start, stop: vi.fn().mockResolvedValue(undefined), addListener });
    localStorage.clear();

    await openNativeCamera();

    lines.push(...JSON.parse(localStorage.getItem('reno.cameraLog') ?? '[]'));
    expect(lines.some((line) => line.includes('nativ: Linse 2: 4080×3060'))).toBe(true);
  });

  it('lets go of the plugin when the camera never opens', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    stubCapacitor({
      start: vi.fn().mockRejectedValue(new Error('Keine Linse dieser Kamera liefert ein Bild')),
      stop,
      addListener: vi.fn(() => Promise.resolve({ remove })),
    });

    await expect(openNativeCamera()).rejects.toThrow('Keine Linse');
    expect(remove).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
