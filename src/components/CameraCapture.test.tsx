import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraCapture } from './CameraCapture';
import type { CameraOptions } from '@/platform/camera';
import type { NativeCamFrame } from '@/platform/nativeCamera';

function fakeTrack(readyState: MediaStreamTrack['readyState'] = 'ended') {
  return {
    label: 'Kamera',
    muted: false,
    readyState,
    getSettings: () => ({}),
    getCapabilities: () => ({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

const openCamera = vi.hoisted(() => vi.fn());
vi.mock('@/platform/camera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/camera')>();
  return { ...actual, openCamera };
});

const nativeCameraSupported = vi.hoisted(() => vi.fn());
const openNativeCamera = vi.hoisted(() => vi.fn());
vi.mock('@/platform/nativeCamera', () => ({ nativeCameraSupported, openNativeCamera }));

const options: CameraOptions = { lockZoom: false, fixedFocus: false, resolution: 'auto' };

beforeEach(() => {
  localStorage.clear();
  openCamera.mockReset();
  nativeCameraSupported.mockReset().mockResolvedValue(false);
  openNativeCamera.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CameraCapture', () => {
  it('does not report a broken lens until video.play() has settled, so play() is never aborted mid-flight', async () => {
    const track = fakeTrack('ended');
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    openCamera.mockResolvedValue(stream);

    let resolvePlay = () => {};
    const playPromise = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockReturnValue(playPromise);

    render(<CameraCapture options={options} onCapture={vi.fn()} onClose={vi.fn()} />);

    // openCamera resolved and the component is wiring up the video, but play() has not
    // settled yet - the broken-lens error must not have been reported at this point,
    // or the <video> it unmounts would abort the still-pending play() call above it.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalled();
    expect(screen.queryByText(/Verbindung beendet/)).not.toBeInTheDocument();

    await act(async () => {
      resolvePlay();
      await playPromise;
    });

    expect(screen.getByText(/Verbindung beendet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Foto aufnehmen')).not.toBeInTheDocument();
  });

  it('prefers the native camera when it is supported, and captures through it', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    nativeCameraSupported.mockResolvedValue(true);

    let frameHandler: ((frame: NativeCamFrame) => void) | null = null;
    const capture = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    const close = vi.fn().mockResolvedValue(undefined);
    openNativeCamera.mockResolvedValue({
      physicalCameraId: 'phys-1',
      onFrame: (handler: (frame: NativeCamFrame) => void) => {
        frameHandler = handler;
        return () => {};
      },
      onError: () => () => {},
      capture,
      close,
    });

    const onCapture = vi.fn();
    render(<CameraCapture options={options} onCapture={onCapture} onClose={vi.fn()} />);

    await waitFor(() => expect(frameHandler).not.toBeNull());
    act(() => frameHandler?.({ base64: 'abc', width: 100, height: 200 }));

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,abc');

    const shutter = await screen.findByLabelText('Foto aufnehmen');
    expect(shutter).not.toBeDisabled();
    fireEvent.click(shutter);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(openCamera).not.toHaveBeenCalled();
  });

  it('falls back to getUserMedia when the native camera fails to open', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    nativeCameraSupported.mockResolvedValue(true);
    openNativeCamera.mockRejectedValue(new Error('kein passender Sensor'));

    const track = fakeTrack('live');
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    openCamera.mockResolvedValue(stream);
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    render(<CameraCapture options={options} onCapture={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(openCamera).toHaveBeenCalledWith(options));
  });
});
