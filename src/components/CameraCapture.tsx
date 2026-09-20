import { useEffect, useRef, useState } from 'react';
import { describeTrack, openCamera, type CameraOptions } from '@/platform/camera';
import { beginCameraSession, cameraLog, endCameraSession } from '@/platform/cameraLog';

interface CameraCaptureProps {
  options: CameraOptions;
  onCapture(blob: Blob): void;
  onClose(): void;
}

/**
 * Full-screen live preview of one exact camera, with a shutter button that grabs the
 * current frame. Stays out of the system camera app entirely - see platform/camera.ts
 * for why that matters.
 *
 * Everything that happens to the stream is written to the camera protocol, because when
 * a lens takes the camera service down, this component dies with it and the protocol is
 * all that is left to read.
 */
export function CameraCapture({ options, onCapture, onClose }: CameraCaptureProps) {
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Kamera">
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white text-sm">
            <p>
              {error}
              <br />
              Unter Einstellungen → Kamera lässt sich eine andere Linse auswählen.
            </p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
        )}
      </div>
      <p className="px-3 py-1 text-[11px] leading-tight text-white/70 bg-black/60 font-mono break-all" aria-live="polite">
        {status}
      </p>
      <div className="flex items-center justify-center gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/60">
        <button type="button" className="btn" onClick={onClose}>
          Abbrechen
        </button>
        {!error && (
          <button
            type="button"
            aria-label="Foto aufnehmen"
            className="w-16 h-16 rounded-full bg-white border-4 border-line disabled:opacity-50"
            onClick={capture}
            disabled={!ready}
          />
        )}
      </div>
    </div>
  );
}
