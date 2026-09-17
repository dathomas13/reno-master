/**
 * The optional half of the reminder: a push token.
 *
 * The reminder itself no longer needs this. It is decided and scheduled on the device
 * (`reminder.ts`), which is why it works with no network and no paid Firebase plan. What a
 * token adds is the one case the device cannot cover on its own: a browser that is closed.
 * So this is best effort throughout - every failure returns false, and the caller carries
 * on with the local reminder.
 */
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { arrayUnion } from 'firebase/firestore';
import { app, auth } from '@/firebase/app';
import { patchDoc } from '@/firebase/db';
import { COL } from '@/data/types';

/**
 * Registers this browser for web push, if the project has it configured.
 *
 * Expects the notification permission to be granted already - asking is the job of
 * `enableReminders`, which needs an answer for the local reminder either way.
 */
export async function registerPushToken(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    if (!(await isSupported().catch(() => false))) return false;

    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) return false; // no push project behind it, which is the normal case

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    const uid = auth.currentUser?.uid;
    if (!token || !uid) return false;

    await patchDoc(COL.users, uid, { fcmTokens: arrayUnion(token) });
    return true;
  } catch {
    return false;
  }
}
