import { customAlphabet } from 'nanoid';

/** url safe, case sensitive, no lookalike characters */
const alphabet = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const generate = customAlphabet(alphabet, 12);

export function newId(): string {
  return generate();
}

/** stable id for this browser/device, used to note which phone holds a photo original */
export function deviceId(): string {
  const key = 'reno.deviceId';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const value = generate();
    localStorage.setItem(key, value);
    return value;
  } catch {
    return 'unknown';
  }
}
