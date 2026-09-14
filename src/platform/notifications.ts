/**
 * Push for the evening reminder.
 *
 * The web build registers an FCM token; the Cloud Function decides at the configured
 * time whether a reminder is due. The native build additionally schedules a local
 * notification, which also fires with no network.
 */
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { arrayUnion } from 'firebase/firestore';
import { app, auth } from '@/firebase/app';
import { patchDoc } from '@/firebase/db';
import { COL } from '@/data/types';

export interface PermissionResult {
  ok: boolean;
  message?: string;
}

export async function requestPushPermission(): Promise<PermissionResult> {
  if (!('Notification' in window)) {
    return { ok: false, message: 'Dieses Gerät unterstützt keine Benachrichtigungen.' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Benachrichtigungen wurden abgelehnt.' };
  }
  if (!(await isSupported().catch(() => false))) {
    return { ok: false, message: 'Push wird von diesem Browser nicht unterstützt.' };
  }

  const vapidKey = import.meta.env.VITE_VAPID_KEY;
  if (!vapidKey) return { ok: false, message: 'Es fehlt der VAPID-Schlüssel in der Konfiguration.' };

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
    const uid = auth.currentUser?.uid;
    if (token && uid) {
      await patchDoc(COL.users, uid, { fcmTokens: arrayUnion(token), reminderEnabled: true });
      return { ok: true };
    }
    return { ok: false, message: 'Kein Token erhalten.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Einrichtung fehlgeschlagen.' };
  }
}
