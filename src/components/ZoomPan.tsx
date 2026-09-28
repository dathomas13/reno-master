import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 8;

interface ZoomPanProps {
  children: ReactNode;
  className?: string;
  /** reports the zoom level, so a parent can keep swipe gestures for the unzoomed view */
  onScaleChange?(scale: number): void;
}

/**
 * Pinch to zoom around the fingers, drag to pan, wheel and double tap to zoom, plus
 * buttons for everyone without a second finger. The content is laid out to fill this
 * box; it is only scaled and moved with a transform.
 */
export function ZoomPan({ children, className = '', onScaleChange }: ZoomPanProps) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const lastTap = useRef(0);
  const [scale, setScale] = useState(1);

  const apply = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      const element = box.current;
      const scaleNow = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
      const width = element?.clientWidth ?? 0;
      const height = element?.clientHeight ?? 0;
      // the content may never leave the box: at 1x it stays put, zoomed it stops at its edges
      const x = Math.min(0, Math.max(width * (1 - scaleNow), next.x));
      const y = Math.min(0, Math.max(height * (1 - scaleNow), next.y));
      const previous = view.current.scale;
      view.current = { scale: scaleNow, x, y };
      if (content.current) content.current.style.transform = `translate(${x}px, ${y}px) scale(${scaleNow})`;
      if (scaleNow !== previous) {
        setScale(scaleNow);
        onScaleChange?.(scaleNow);
      }
    },
    [onScaleChange],
  );

  /** zoom to `target` keeping the box point (px, py) where it is */
  const zoomAt = useCallback(
    (target: number, px: number, py: number) => {
      const { scale: current, x, y } = view.current;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      const cx = (px - x) / current;
      const cy = (py - y) / current;
      apply({ scale: clamped, x: px - cx * clamped, y: py - cy * clamped });
    },
    [apply],
  );

  const zoomCentered = useCallback(
    (factor: number) => {
      const element = box.current;
      if (!element) return;
      zoomAt(view.current.scale * factor, element.clientWidth / 2, element.clientHeight / 2);
    },
    [zoomAt],
  );

  useEffect(() => {
    const element = box.current;
    if (!element) return;

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const centre = () => {
      const [a, b] = [...pointers.current.values()];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) } : null;
    };

    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button')) return;
      pointers.current.set(event.pointerId, local(event));
      if (pointers.current.size === 1) dragged.current = false;
      else dragged.current = true;
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      const point = local(event);
      const { scale: current, x, y } = view.current;
      if (pointers.current.size === 1) {
        if (!dragged.current && Math.hypot(point.x - previous.x, point.y - previous.y) < 4) return;
        // capture only once it is a drag, so a tap still reaches the element under it
        if (!dragged.current) element.setPointerCapture?.(event.pointerId);
        dragged.current = true;
        pointers.current.set(event.pointerId, point);
        apply({ scale: current, x: x + point.x - previous.x, y: y + point.y - previous.y });
      } else if (pointers.current.size === 2) {
        const before = centre();
        pointers.current.set(event.pointerId, point);
        const after = centre();
        if (!before || !after || !before.distance) return;
        const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * (after.distance / before.distance)));
        const cx = (before.x - x) / current;
        const cy = (before.y - y) / current;
        apply({ scale: target, x: after.x - cx * target, y: after.y - cy * target });
      }
    };
    const up = (event: PointerEvent) => {
      const wasSingle = pointers.current.size === 1 && !dragged.current;
      pointers.current.delete(event.pointerId);
      if (event.type === 'pointerup' && wasSingle) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          const point = local(event);
          zoomAt(view.current.scale > 1.05 ? 1 : 3, point.x, point.y);
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = local(event);
      zoomAt(view.current.scale * Math.exp(-event.deltaY * 0.0015), point.x, point.y);
    };
    // a resize (rotation) would leave a zoomed view off-centre; start over
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => apply({ scale: 1, x: 0, y: 0 }));
    observer?.observe(element);

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer?.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [apply, zoomAt]);

  // a drag must not end in a click on whatever lies under the finger
  function swallowClickAfterDrag(event: React.MouseEvent) {
    if (dragged.current) {
      event.stopPropagation();
      dragged.current = false;
    }
  }

  const button = 'btn btn-ghost w-11 h-11 min-h-0 p-0 bg-panel/80';
  return (
    <div ref={box} className={`relative overflow-hidden touch-none select-none ${className}`} onClickCapture={swallowClickAfterDrag}>
      <div ref={content} className="w-full h-full origin-top-left">
        {children}
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={button} aria-label="Vergrößern" title="Vergrößern"
          disabled={scale >= MAX_SCALE} onClick={() => zoomCentered(1.6)}>+</button>
        <button type="button" className={button} aria-label="Verkleinern" title="Verkleinern"
          disabled={scale <= MIN_SCALE} onClick={() => zoomCentered(1 / 1.6)}>&#8722;</button>
      </div>
    </div>
  );
}
