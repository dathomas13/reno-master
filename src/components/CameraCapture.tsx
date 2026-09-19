import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  /** a specific lens, picked in the settings; omitted falls back to the back camera */
  deviceId?: string;
  onCapture(blob: Blob): void;
  onClose(): void;
}

/**
 * Full-screen live preview of one exact camera, with a shutter button that grabs the
 * current frame. Stays out of the system camera app entirely - see platform/camera.ts
 * for why that matters.
 */
export function CameraCapture({ deviceId, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Kamera konnte nicht geöffnet werden.');
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [deviceId]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
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
