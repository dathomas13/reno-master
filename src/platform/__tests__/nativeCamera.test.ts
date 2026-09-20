import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeCameraSupported, openNativeCamera } from '../nativeCamera';

function stubCapacitor(plugin: Record<string, unknown> | undefined) {
  vi.stubGlobal('Capacitor', {
    isNativePlatform: () => true,
    Plugins: plugin ? { NativeCam: plugin } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
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
});
