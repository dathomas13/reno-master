/**
 * Offline first, also for the start: the app shows its cached data at once, whatever the
 * reception.
 *
 * Restoring the stored session, Firebase Auth first asks the server whether the account
 * still exists (`accounts:lookup`) and only then reports the user - and Firestore, cache
 * reads included, waits for that report. With no network the request fails at once and
 * the stored user is taken; with bad reception it hangs until its timeout, and the app sat
 * on "Wird geladen…" for 24 s (device log, 14.10.2026). So while the session is being
 * restored, that one request fails right away as "no network": Firebase keeps the stored
 * user, exactly as offline. Whether the account is still valid shows on the next token
 * refresh in the background - a refused refresh signs out as before.
 */

type Fetch = typeof fetch;

const LOOKUP = '/accounts:lookup';

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Wraps `target.fetch` until `restored` settles; afterwards every request goes through
 * untouched (an explicit reload later still reaches the server).
 */
export function skipSessionCheckWhileRestoring(
  target: { fetch: Fetch },
  restored: Promise<unknown>,
): void {
  const original = target.fetch;
  if (typeof original !== 'function') return;
  let restoring = true;
  target.fetch = ((input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]) => {
    if (restoring && urlOf(input).includes(LOOKUP)) {
      // what fetch itself throws without a connection - Firebase reads it as offline
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return original.call(target, input, init);
  }) as Fetch;
  const done = () => {
    restoring = false;
  };
  restored.then(done, done);
}
