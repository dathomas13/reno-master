import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { resolveFileUrl } from '@/offline/fileUrls';

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({ storagePath }: { storagePath: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(320);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(1, (element.clientWidth || 344) - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setPageNumber(1);
    setZoom(1);
    setError(null);
    setRendering(true);
    const timer = setTimeout(() => {
      active = false;
      setError('Das Laden dauert zu lange. Bitte erneut versuchen.');
      void task?.destroy().catch(() => undefined);
    }, 30_000);

    void (async () => {
      try {
        const url = await resolveFileUrl(storagePath);
        if (!active) return;
        if (!url) {
          setError('Datei nicht auf diesem Gerät verfügbar. Bitte mit Netz erneut versuchen.');
          return;
        }
        task = getDocument({ url, isEvalSupported: false });
        task.onPassword = () => {
          if (!active) return;
          active = false;
          clearTimeout(timer);
          setError('Diese PDF ist passwortgeschützt. Bitte eine ungeschützte Kopie verwenden.');
          void task?.destroy().catch(() => undefined);
        };
        const document = await task.promise;
        if (active) setPdf(document);
      } catch {
        if (active) setError('PDF konnte nicht geladen werden. Die Datei ist möglicherweise beschädigt oder nicht verfügbar.');
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      void task?.destroy().catch(() => undefined);
    };
  }, [storagePath, attempt]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    const element = canvas.current;
    let active = true;
    let task: RenderTask | undefined;
    setRendering(true);
    setError(null);
    container.current?.scrollTo?.(0, 0);
    const timer = setTimeout(() => {
      active = false;
      task?.cancel();
      setError('Die PDF-Seite konnte nicht rechtzeitig angezeigt werden.');
    }, 30_000);

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!active) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(width, 1200) / original.width * zoom });
        const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height));
        element.width = Math.ceil(viewport.width * pixelRatio);
        element.height = Math.ceil(viewport.height * pixelRatio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        const context = element.getContext('2d');
        if (!context) throw new Error('PDF-Anzeige ist auf diesem Gerät nicht verfügbar.');
        task = page.render({
          canvasContext: context,
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
        if (active) setRendering(false);
      } catch {
        if (active) setError('PDF-Seite konnte nicht angezeigt werden. Die Datei ist möglicherweise beschädigt.');
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, pageNumber, zoom, width]);

  const controlsDisabled = !pdf || Boolean(error);
  const iconButton = 'btn btn-ghost w-11 h-11 min-h-0 p-0 shrink-0';

  return (
    <div className="flex flex-col w-full h-full min-h-0 min-w-0" aria-label="PDF-Ansicht">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 py-1 bg-panel shrink-0">
        <div className="flex items-center">
          <button type="button" className={iconButton} aria-label="Vorherige PDF-Seite" title="Vorherige PDF-Seite"
            disabled={controlsDisabled || pageNumber <= 1} onClick={() => setPageNumber((current) => current - 1)}>&#8592;</button>
          <span className="text-sm text-center w-20 tabular-nums" aria-live="polite">{pageNumber} / {pdf?.numPages ?? '-'}</span>
          <button type="button" className={iconButton} aria-label="Nächste PDF-Seite" title="Nächste PDF-Seite"
            disabled={controlsDisabled || pageNumber >= (pdf?.numPages ?? 1)} onClick={() => setPageNumber((current) => current + 1)}>&#8594;</button>
        </div>
        <div className="flex items-center">
          <button type="button" className={iconButton} aria-label="Zoom verkleinern" title="Zoom verkleinern"
            disabled={controlsDisabled || zoom <= 1} onClick={() => setZoom((current) => current - 0.5)}>&#8722;</button>
          <span className="text-sm text-center w-14 tabular-nums">{Math.round(zoom * 100)} %</span>
          <button type="button" className={iconButton} aria-label="Zoom vergrößern" title="Zoom vergrößern"
            disabled={controlsDisabled || zoom >= 3} onClick={() => setZoom((current) => current + 0.5)}>+</button>
        </div>
      </div>
      <div ref={container} className="flex-1 min-h-0 min-w-0 overflow-auto overscroll-contain [scrollbar-gutter:stable] p-3">
        {error ? (
          <div className="max-w-md mx-auto text-center p-4">
            <p role="alert" className="text-sm text-ink break-words">{error}</p>
            <button type="button" className="btn mt-3" onClick={() => setAttempt((current) => current + 1)}>Erneut versuchen</button>
          </div>
        ) : (
          <>
            {(!pdf || rendering) && <p role="status" className="text-sm text-muted text-center py-3">PDF wird geladen…</p>}
            {pdf && <canvas key={`${pageNumber}-${zoom}-${width}`} ref={canvas} aria-label={`PDF-Seite ${pageNumber}`}
              className="block mx-auto bg-white max-w-none" style={{ visibility: rendering ? 'hidden' : 'visible' }} />}
          </>
        )}
      </div>
    </div>
  );
}