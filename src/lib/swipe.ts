/**
 * Swiping sideways over a screen switches to the neighbouring tab of its area
 * (Aufgaben ⇄ Notizen …). Only the decision lives here, so it can be tested without
 * touch events; `SectionTabs` listens and navigates.
 */

export interface SwipeTrack {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** milliseconds between touch start and end */
  ms: number;
  /** width of the screen in css pixels */
  width: number;
}

/** Android's back gesture starts at the screen edge - a swipe from there is not ours */
export const EDGE_PX = 28;
const MIN_DISTANCE_PX = 70;
const MAX_DURATION_MS = 700;

/** +1 = to the next tab (finger moved left), -1 = to the previous one, 0 = not a tab swipe */
export function swipeStep(track: SwipeTrack): -1 | 0 | 1 {
  const dx = track.x1 - track.x0;
  const dy = track.y1 - track.y0;
  if (track.x0 < EDGE_PX || track.x0 > track.width - EDGE_PX) return 0;
  if (track.ms > MAX_DURATION_MS) return 0;
  if (Math.abs(dx) < MIN_DISTANCE_PX) return 0;
  // clearly sideways: scrolling the list is never mistaken for a switch
  if (Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** the tab a swipe leads to, or null at the ends (no wrapping round) */
export function neighbourTab(activeIndex: number, count: number, step: -1 | 0 | 1): number | null {
  if (step === 0 || activeIndex < 0) return null;
  const next = activeIndex + step;
  return next >= 0 && next < count ? next : null;
}
