import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConstraints, openCamera } from '../camera';
import { clearCameraLog, readCameraLog } from '../cameraLog';

function fakeTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return {
    label: 'Kamera',
    muted: false,
    readyState: 'live',
    getSettings: () => ({}),
    getCapabilities: () => ({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MediaStreamTrack;
}

function fakeStream(track: MediaStreamTrack | null): MediaStream {
  return {
    getVideoTracks: () => (track ? [track] : []),
    getTracks: () => (track ? [track] : []),
  } as unknown as MediaStream;
}

beforeEach(() => {
  localStorage.clear();
  clearCameraLog();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildConstraints', () => {
  it('asks for an exact lens when one is chosen', () => {
    const constraints = buildConstraints({ deviceId: 'abc', lockZoom: false, fixedFocus: false, resolution: 'auto' });
    expect(constraints.video).toEqual({ deviceId: { exact: 'abc' } });
  });

  it('falls back to the back camera and the requested resolution otherwise', () => {
    const constraints = buildConstraints({ lockZoom: false, fixedFocus: false, resolution: 'hd' });
    expect(constraints.video).toEqual({ facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } });
  });
});

describe('openCamera', () => {
  it('drops a lens that has gone stale and retries with automatic selection', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('deviceId'), { name: 'OverconstrainedError', constraint: 'deviceId' }))
      .mockResolvedValueOnce(fakeStream(fakeTrack()));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const stream = await openCamera({ deviceId: 'stale-id', lockZoom: false, fixedFocus: false, resolution: 'auto' });

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { audio: false, video: { deviceId: { exact: 'stale-id' } } });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: false, video: { facingMode: 'environment' } });
    expect(readCameraLog().some((line) => line.includes('automatische Auswahl'))).toBe(true);
  });

  it('still rejects an OverconstrainedError that is not about the device id', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('width'), { name: 'OverconstrainedError', constraint: 'width' }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(openCamera({ deviceId: 'abc', lockZoom: false, fixedFocus: false, resolution: 'hd' })).rejects.toThrow('width');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('rejects when there is no lens selected to fall back from', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('deviceId'), { name: 'OverconstrainedError', constraint: 'deviceId' }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(openCamera({ lockZoom: false, fixedFocus: false, resolution: 'auto' })).rejects.toThrow('deviceId');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
