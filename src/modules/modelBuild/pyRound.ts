/**
 * Rounding exactly like Python's round(x, n).
 *
 * The scene builder exists twice - tools/model/build_scene_lite.py and this module - and
 * both must produce the same vertices. Rounding decides which corners weld into one, so
 * "almost the same" is not enough: Python rounds the exact binary value half to even,
 * while Math.round(x * 100) / 100 rounds an already rounded product half up. The stairs
 * alone (rise 171.875) hit such ties.
 *
 * toFixed(100) yields the exact decimal expansion of a double of this magnitude, so the
 * decision is made on the true value, and a tie is broken to the even digit.
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const negative = x < 0;
  const exact = Math.abs(x).toFixed(100);
  const dot = exact.indexOf('.');
  const kept = exact.slice(0, dot) + exact.slice(dot + 1, dot + 1 + digits);
  const rest = exact.slice(dot + 1 + digits);
  let up: boolean;
  if (rest[0] > '5') up = true;
  else if (rest[0] < '5') up = false;
  else if (/[1-9]/.test(rest.slice(1))) up = true;
  else up = Number(kept[kept.length - 1]) % 2 === 1;
  let units = BigInt(kept);
  if (up) units += 1n;
  const text = units.toString().padStart(digits + 1, '0');
  const value = Number(digits > 0
    ? `${text.slice(0, text.length - digits)}.${text.slice(text.length - digits)}`
    : text);
  return negative ? -value : value;
}
