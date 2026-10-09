/**
 * The tape measure of the 3D view: the arithmetic, free of three so it can be tested.
 *
 * Points are model millimetres (x east, y north, z up), the same frame as the house
 * file. The scene works in three metres with y up - `fromWorld` turns one into the other.
 */

export interface ModelPoint {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Measurement {
  /** straight line between the two points, mm */
  total: number;
  /** projected onto the floor, mm */
  horizontal: number;
  /** east-west, north-south and height difference, all positive, mm */
  dx: number;
  dy: number;
  dz: number;
}

/** three world coordinates (metres, y up, north = -z) to model mm */
export function fromWorld(world: { x: number; y: number; z: number }): ModelPoint {
  return { x: world.x * 1000, y: -world.z * 1000, z: world.y * 1000 };
}

export function measure(a: ModelPoint, b: ModelPoint): Measurement {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);
  const horizontal = Math.hypot(dx, dy);
  return { total: Math.hypot(horizontal, dz), horizontal, dx, dy, dz };
}

/** "3,42 m" - centimetres are what a tape measure on site reads */
export function formatMetres(mm: number): string {
  const cm = Math.round(mm / 10);
  return `${(cm / 100).toFixed(2).replace('.', ',')} m`;
}

/** "3.418 mm" */
export function formatMillimetres(mm: number): string {
  return `${Math.round(mm).toLocaleString('de-DE')} mm`;
}

/** index of the screen point closest to `at` within `radius` pixels, -1 when none is */
export function nearestWithin(points: readonly ScreenPoint[], at: ScreenPoint, radius: number): number {
  let best = -1;
  let bestDistance = radius;
  points.forEach((point, index) => {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Where the magnifier goes while a finger moves a point: above the finger, which
 * covers the point itself, and to the side near the top edge. Top-left corner in
 * canvas pixels.
 */
export function loupePlacement(
  finger: ScreenPoint,
  size: number,
  width: number,
  height: number,
  gap = 40,
): ScreenPoint {
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 4), Math.max(4, max - size - 4));
  let left = finger.x - size / 2;
  let top = finger.y - gap - size;
  if (top < 4) {
    // no room above: beside the finger, on the side with more space
    top = finger.y - size / 2;
    left = finger.x > width / 2 ? finger.x - gap - size : finger.x + gap;
  }
  return { x: clamp(left, width), y: clamp(top, height) };
}
