import { useEffect, useRef, useState, type ReactNode } from 'react';
import { describeTrack, openCamera, type CameraOptions } from '@/platform/camera';
import { beginCameraSession, cameraLog, endCameraSession } from '@/platform/cameraLog';
import { isNative } from '@/platform/index';
import {
  giveUpOnNativeCamera,
  nativeCameraSupported,
  openNativeCamera,
  type NativeCameraSession,
} from '@/platform/nativeCamera';

interface CameraCaptureProps {
  options: CameraOptions;
  onCapture(blob: Blob): void;
  onClose(): void;
}

/**
 * NOT WIRED UP. Nothing renders this any more, and that is on purpose.
 *
 * It exists for one phone whose rear camera is broken beyond what any app can work around
 * (the measurements are in plugins/nativecam/README.md). On every healthy device the system
 * camera does this better, so the app takes photos through the file input again and none of
 * this appears in the interface. Kept whole - component, platform/camera.ts, platform/
 * nativeCamera.ts, platform/cameraLog.ts and the nativecam plugin - so that picking the
 * question back up costs a render call rather than a rewrite: PhotoAttach.openCamera is where
 * it used to hang.
 *
 * Full-screen live preview with a shutter button that grabs the current frame. Stays out of
 * the system camera app entirely - see platform/camera.ts for why that matters.
 *
 * Two implementations share this shell: WebCameraCapture (getUserMedia, used on the web and
 * as the native fallback) and NativeCameraCapture (Camera2 through plugins/nativecam, used
 * on the APK when it can bind to a physical sensor - see that plugin's README for why that
 * matters there). Which one runs is decided once per mount and does not change mid-session.
 */
export function CameraCapture(props: CameraCaptureProps) {
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>(() => (isNative() ? 'pending' : 'web'));

  useEffect(() => {
    if (mode !== 'pending') return;
    let active = true;
    nativeCameraSupported().then((supported) => {
      if (active) setMode(supported ? 'native' : 'web');
    });
    return () => {
      active = false;
    };
  }, [mode]);

  if (mode === 'web') return <WebCameraCapture {...props} />;
  if (mode === 'native') return <NativeCameraCapture {...props} onFallback={() => setMode('web')} />;
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center text-white/60 text-sm" role="dialog" aria-label="Kamera">
      Kamera wird geöffnet…
    </div>
  );
}

function CameraShell({
  error,
  status,
  ready,
  onClose,
  onCapture,
  children,
}: {
  error: string | null;
  status: string;
  ready: boolean;
  onClose(): void;
  onCapture?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Kamera">
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white text-sm">
            <p>
              {error}
              <br />
              Fotos lassen sich auch mit der Systemkamera aufnehmen und danach aus der Galerie übernehmen.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
      <p className="px-3 py-1 text-[11px] leading-tight text-white/70 bg-black/60 font-mono break-all" aria-live="polite">
        {status}
      </p>
      <div className="flex items-center justify-center gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/60">
        <button type="button" className="btn" onClick={onClose}>
          Abbrechen
        </button>
        {!error && onCapture && (
          <button
            type="button"
            aria-label="Foto aufnehmen"
            className="w-16 h-16 rounded-full bg-white border-4 border-line disabled:opacity-50"
            onClick={onCapture}
            disabled={!ready}
          />
        )}
      </div>
    </div>
  );
}

function WebCameraCapture({ options, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Kamera wird geöffnet…');

  useEffect(() => {
    let active = true;
    const opened = Date.now();
    const cleanups: (() => void)[] = [];
    setReady(false);
    setError(null);
    beginCameraSession(options.deviceId ? `Linse ${options.deviceId.slice(0, 8)}` : 'automatisch');

    const video = videoRef.current;
    const elapsed = () => `${((Date.now() - opened) / 1000).toFixed(1)}s`;

    function refreshStatus(track: MediaStreamTrack | undefined) {
      if (!active) return;
      const size = video?.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : 'kein Bild';
      const trackState = track ? `${track.label} · ${track.muted ? 'STUMM' : 'liefert'} · ${track.readyState}` : 'keine Spur';
      setStatus(`${elapsed()} · ${size} · ${trackState}`);
    }

    openCamera(options)
      .then(async (stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        let onEnded = () => {};
        let endedOnArrival = false;
        if (track) {
          onEnded = () => {
            if (!active) return;
            setReady(false);
            setError('Die Kamera hat die Verbindung beendet (Linse abgestürzt?).');
          };
          const onTrack = (name: string) => () => {
            cameraLog(`Spur ${name} bei ${elapsed()}: ${describeTrack(track)}`);
            refreshStatus(track);
            if (name === 'ended') onEnded();
          };
          for (const name of ['mute', 'unmute', 'ended'] as const) {
            const handler = onTrack(name);
            track.addEventListener(name, handler);
            cleanups.push(() => track.removeEventListener(name, handler));
          }
          // some broken lenses hand back a track that is already 'ended' on arrival, before
          // any listener could catch the transition - the state itself is the only signal then.
          // Reporting it has to wait until after video.play() below has settled: setError()
          // unmounts the <video>, and doing that while play() is still in flight aborts it
          // with a misleading "removed from the document" error.
          endedOnArrival = track.readyState === 'ended';
          if (endedOnArrival) cameraLog(`Spur bereits beendet bei ${elapsed()}: ${describeTrack(track)}`);
        }
        if (video) {
          const onVideo = (name: string) => () => {
            cameraLog(`Video ${name} bei ${elapsed()}: ${video.videoWidth}×${video.videoHeight}`);
            refreshStatus(track);
            if (name === 'playing' && active) setReady(true);
          };
          for (const name of ['loadedmetadata', 'playing', 'stalled', 'suspend', 'error', 'pause'] as const) {
            const handler = onVideo(name);
            video.addEventListener(name, handler);
            cleanups.push(() => video.removeEventListener(name, handler));
          }
          video.srcObject = stream;
          try {
            await video.play();
            cameraLog(`play() ok bei ${elapsed()}`);
          } catch (cause) {
            cameraLog(`✖ play() scheitert: ${cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause)}`);
          }
        }
        refreshStatus(track);
        if (endedOnArrival) onEnded();
        // a heartbeat, so a crash leaves behind how far the camera got before it died
        let ticks = 0;
        const timer = window.setInterval(() => {
          ticks += 1;
          refreshStatus(track);
          if (ticks <= 10 || ticks % 5 === 0) {
            cameraLog(`lebt ${elapsed()}: ${video?.videoWidth ?? 0}×${video?.videoHeight ?? 0} ${track ? describeTrack(track) : ''}`);
          }
        }, 1000);
        cleanups.push(() => window.clearInterval(timer));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const message = cause instanceof Error ? `${cause.name}: ${cause.message}` : 'Kamera konnte nicht geöffnet werden.';
        setError(message);
        setStatus(`${elapsed()} · Fehler`);
      });
    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      endCameraSession(`nach ${elapsed()}`);
    };
  }, [options]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    cameraLog(`Auslöser: ${canvas.width}×${canvas.height}`);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <CameraShell error={error} status={status} ready={ready} onClose={onClose} onCapture={capture}>
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
    </CameraShell>
  );
}

/**
 * Native path over plugins/nativecam. There is no live <video> here: the plugin re-encodes
 * each preview frame as a small JPEG (see that plugin's README for why it is not a real
 * native view), so the picture is a still <img> that gets a new src a few times a second.
 */
function NativeCameraCapture({ onCapture, onClose, onFallback }: CameraCaptureProps & { onFallback(): void }) {
  const sessionRef = useRef<NativeCameraSession | null>(null);
  const capturingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Kamera wird geöffnet…');
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const opened = Date.now();
    const elapsed = () => `${((Date.now() - opened) / 1000).toFixed(1)}s`;
    beginCameraSession('nativ');
    let offFrame: (() => void) | null = null;
    let offError: (() => void) | null = null;
    let framesSeen = 0;

    openNativeCamera()
      .then((session) => {
        if (!active) {
          void session.close();
          return;
        }
        sessionRef.current = session;
        cameraLog(`Native Kamera bereit${session.physicalCameraId ? ` (Sensor ${session.physicalCameraId})` : ''}`);
        offFrame = session.onFrame((nextFrame) => {
          if (!active) return;
          framesSeen += 1;
          setFrame(`data:image/jpeg;base64,${nextFrame.base64}`);
          setStatus(`${elapsed()} · ${nextFrame.width}×${nextFrame.height} · nativ`);
          if (framesSeen === 1) {
            cameraLog(`erstes Bild bei ${elapsed()}: ${nextFrame.width}×${nextFrame.height}`);
            setReady(true);
          }
        });
        offError = session.onError((message) => {
          if (!active) return;
          cameraLog(`✖ native Kamera: ${message}`);
          setReady(false);
          setError(`Die Kamera hat die Verbindung beendet (${message}).`);
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        cameraLog(`✖ native Kamera scheitert, wechsle auf getUserMedia: ${message}`);
        // whatever went wrong, it will go wrong again this run - and each attempt leaves the
        // camera service worse off for the browser path that has to carry us instead
        giveUpOnNativeCamera();
        void sessionRef.current?.close();
        sessionRef.current = null;
        onFallback();
      });

    return () => {
      active = false;
      offFrame?.();
      offError?.();
      void sessionRef.current?.close();
      sessionRef.current = null;
      endCameraSession(`nach ${elapsed()}`);
    };
  }, [onFallback]);

  async function capture() {
    if (capturingRef.current) return;
    const session = sessionRef.current;
    if (!session) return;
    capturingRef.current = true;
    try {
      const blob = await session.capture();
      cameraLog(`Auslöser (nativ): ${blob.size} Bytes`);
      onCapture(blob);
    } catch (cause) {
      cameraLog(`✖ native Aufnahme scheitert: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      capturingRef.current = false;
    }
  }

  return (
    <CameraShell error={error} status={status} ready={ready} onClose={onClose} onCapture={capture}>
      {frame ? (
        <img src={frame} alt="Kamera-Vorschau" className="w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">Kamera wird geöffnet…</div>
      )}
    </CameraShell>
  );
}
