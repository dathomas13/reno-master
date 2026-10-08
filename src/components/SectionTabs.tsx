import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EDGE_PX, neighbourTab, swipeStep } from '@/lib/swipe';
import { debugLog } from '@/platform/debugLog';

export interface SectionTab {
  to: string;
  label: string;
  active: boolean;
}

/**
 * The tabs of an area (Tagebuch: Einträge · Fotos, …): the screens that belong together
 * sit side by side here instead of being scattered over the menu. Real links, so back
 * and the address keep working the way they did when each screen had its own entry.
 * Underlined like tabs, not boxed: they belong to the header, and must not look like
 * the filters and switches inside the screen.
 */
export function SectionTabs({ tabs, label, className = '' }: { tabs: SectionTab[]; label: string; className?: string }) {
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const active = tabs.findIndex((tab) => tab.active);
  useTabSwipe(tabs, label, navRef, barRef);

  // the gold bar is moved by hand: it follows the finger, and after a swipe it glides
  // from the tab that was left to the one that opened
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const arrival = arrivingSwipe?.label === label ? arrivingSwipe : null;
    arrivingSwipe = null;
    if (arrival && !reducedMotion()) {
      if (bar.dataset.dragging !== '1') {
        bar.style.transition = 'none';
        bar.style.transform = `translateX(${arrival.from * 100}%)`;
        void bar.offsetWidth;
      }
      bar.style.transition = 'transform 200ms ease-out';
      for (const element of contentAfter(navRef.current)) {
        element.style.transform = '';
        element.style.opacity = '';
        element.animate(
          [
            { transform: `translateX(${arrival.step * 28}px)`, opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 200, easing: 'ease-out' },
        );
      }
    } else {
      bar.style.transition = 'none';
    }
    delete bar.dataset.dragging;
    bar.style.transform = `translateX(${Math.max(active, 0) * 100}%)`;
  }, [active, label]);

  return (
    <nav ref={navRef} aria-label={label} className={`border-b border-line px-3 ${className}`}>
      <div className="relative flex">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            to={tab.to}
            replace
            aria-current={tab.active ? 'page' : undefined}
            className={`flex-1 min-w-0 min-h-11 px-2 text-sm truncate grid place-items-center ${
              tab.active ? 'text-accent font-semibold' : 'text-muted'
            }`}
          >
            {tab.label}
          </Link>
        ))}
        {active >= 0 && (
          <div
            ref={barRef}
            aria-hidden="true"
            className="absolute bottom-0 left-0 h-0.5 bg-accent rounded-full"
            style={{ width: `${100 / tabs.length}%` }}
          />
        )}
      </div>
    </nav>
  );
}

/** where a sideways swipe must stay what it is: typing, sheets, the lightbox, the model */
const NO_SWIPE = 'input, textarea, select, canvas, [role="dialog"], [data-no-swipe]';

/** set by a swipe, read by the tabs that open next - they animate the arrival */
let arrivingSwipe: { label: string; from: number; step: -1 | 1 } | null = null;

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** the screen's content: everything after the tab row in the same container */
function contentAfter(nav: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let element = nav?.nextElementSibling; element; element = element.nextElementSibling) {
    if (element instanceof HTMLElement) out.push(element);
  }
  return out;
}

/**
 * Swiping sideways anywhere on the screen moves to the neighbouring tab. While the
 * finger moves, the gold bar follows it and the content leans a little the same way,
 * so it is clear before letting go what will happen; short of the threshold all of it
 * springs back.
 */
function useTabSwipe(
  tabs: SectionTab[],
  label: string,
  navRef: RefObject<HTMLElement>,
  barRef: RefObject<HTMLDivElement>,
) {
  const navigate = useNavigate();
  const latest = useRef(tabs);
  latest.current = tabs;

  useEffect(() => {
    let start: { x: number; y: number; at: number } | null = null;
    let axis: 'x' | 'y' | null = null;

    function activeIndex() {
      return latest.current.findIndex((tab) => tab.active);
    }

    function reset(animate: boolean) {
      const bar = barRef.current;
      if (bar) {
        delete bar.dataset.dragging;
        bar.style.transition = animate ? 'transform 180ms ease-out' : 'none';
        bar.style.transform = `translateX(${Math.max(activeIndex(), 0) * 100}%)`;
      }
      for (const element of contentAfter(navRef.current)) {
        const from = element.style.transform;
        const opacity = element.style.opacity;
        element.style.transform = '';
        element.style.opacity = '';
        if (animate && from) {
          element.animate([{ transform: from, opacity: opacity || '1' }, { transform: 'none', opacity: 1 }], {
            duration: 180,
            easing: 'ease-out',
          });
        }
      }
    }

    function onStart(event: TouchEvent) {
      const target = event.target as Element | null;
      const touch = event.touches[0];
      const blocked =
        event.touches.length > 1 ||
        !touch ||
        touch.clientX < EDGE_PX ||
        touch.clientX > window.innerWidth - EDGE_PX ||
        !!target?.closest(NO_SWIPE) ||
        !!document.querySelector('[aria-modal="true"]');
      start = blocked ? null : { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
      axis = null;
    }

    function onMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start || !touch || axis === 'y') return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!axis) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) axis = 'y';
        else if (Math.abs(dx) > 10 && Math.abs(dx) > 2 * Math.abs(dy)) axis = 'x';
        if (axis !== 'x') return;
      }
      if (reducedMotion()) return;
      const index = activeIndex();
      const toward = dx < 0 ? 1 : -1;
      const open = neighbourTab(index, latest.current.length, toward) !== null;
      // towards a tab the bar follows all the way, at the ends it only gives a little
      const progress = Math.max(-1, Math.min(1, -dx / (window.innerWidth * 0.5))) * (open ? 1 : 0.15);
      const bar = barRef.current;
      if (bar) {
        bar.dataset.dragging = '1';
        bar.style.transition = 'none';
        bar.style.transform = `translateX(${(Math.max(index, 0) + progress) * 100}%)`;
      }
      const lean = Math.max(-40, Math.min(40, dx * (open ? 0.25 : 0.08)));
      for (const element of contentAfter(navRef.current)) {
        element.style.transform = `translateX(${lean}px)`;
        element.style.opacity = String(1 - Math.abs(progress) * 0.35);
      }
    }

    function onEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const step = swipeStep({
        x0: start.x,
        y0: start.y,
        x1: touch.clientX,
        y1: touch.clientY,
        ms: event.timeStamp - start.at,
        width: window.innerWidth,
      });
      start = null;
      const current = latest.current;
      const index = activeIndex();
      const next = step === 0 ? null : neighbourTab(index, current.length, step);
      if (next === null || step === 0) {
        if (axis === 'x') reset(true);
        return;
      }
      arrivingSwipe = { label, from: index, step };
      debugLog('navigation', `Wischen zu ${current[next]!.label}`);
      navigate(current[next]!.to, { replace: true });
    }

    function onCancel() {
      if (start && axis === 'x') reset(true);
      start = null;
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [navigate, label, navRef, barRef]);
}

/** the tab sets of the areas, so every screen of an area shows the same row */
export const AREA_TABS = {
  diary: (active: 'entries' | 'photos'): SectionTab[] => [
    { to: '/tagebuch', label: 'Einträge', active: active === 'entries' },
    { to: '/fotos', label: 'Fotos', active: active === 'photos' },
  ],
  house: (active: '3d' | 'plans'): SectionTab[] => [
    { to: '/3d', label: '3D', active: active === '3d' },
    { to: '/plaene', label: 'Pläne', active: active === 'plans' },
  ],
  tasks: (active: 'tasks' | 'notes'): SectionTab[] => [
    { to: '/aufgaben', label: 'Aufgaben', active: active === 'tasks' },
    { to: '/notizen', label: 'Notizen', active: active === 'notes' },
  ],
  contacts: (active: 'contacts' | 'logs'): SectionTab[] => [
    { to: '/kontakte', label: 'Kontakte', active: active === 'contacts' },
    { to: '/gespraeche', label: 'Gespräche', active: active === 'logs' },
  ],
};
