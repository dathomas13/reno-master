/**
 * After a call or chat started from a contact, the app offers to write down what was
 * said. The call itself happens outside the app, so all it can do is remember who was
 * called and when, and ask once the user is back - if that is soon enough to still be
 * about this call.
 */
const KEY = 'reno.call.pending';

/** back later than this, the offer would only puzzle */
export const FOLLOW_UP_WINDOW_MS = 30 * 60 * 1000;
/** back sooner than this, the call cannot have happened yet (the dialer just opened) */
export const FOLLOW_UP_MIN_MS = 5 * 1000;

export interface PendingCall {
  contactId: string;
  name: string;
  /** contactChannels id the log entry gets */
  channel: string;
  /** epoch milliseconds */
  at: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function store(): StorageLike | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function rememberCall(call: PendingCall, storage: StorageLike | null = store()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(call));
  } catch {
    // no storage, no offer - nothing else depends on it
  }
}

/**
 * The call to offer a note for, if there is one that fits `now`. A call is offered at most
 * once: it is removed as soon as it is taken - or found too old. One that is too fresh
 * stays for the next time the app comes back.
 */
export function takeCallFollowUp(now: number, storage: StorageLike | null = store()): PendingCall | null {
  let call: PendingCall | null = null;
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PendingCall>) : null;
    if (parsed && typeof parsed.contactId === 'string' && typeof parsed.at === 'number') {
      call = {
        contactId: parsed.contactId,
        name: typeof parsed.name === 'string' ? parsed.name : '',
        channel: typeof parsed.channel === 'string' ? parsed.channel : '',
        at: parsed.at,
      };
    }
  } catch {
    call = null;
  }
  if (!call) {
    try {
      storage?.removeItem(KEY);
    } catch {
      // nothing to clean up then
    }
    return null;
  }
  const age = now - call.at;
  if (age < FOLLOW_UP_MIN_MS) return null;
  try {
    storage?.removeItem(KEY);
  } catch {
    // offered twice at worst
  }
  return age <= FOLLOW_UP_WINDOW_MS ? call : null;
}

/** where the offer leads: the log editor with contact, channel and time already set */
export function followUpPath(call: PendingCall): string {
  const params = new URLSearchParams({ neu: '1', kontakt: call.contactId });
  if (call.channel) params.set('kanal', call.channel);
  return `/gespraeche?${params.toString()}`;
}
