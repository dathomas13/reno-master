/**
 * Sign in with e-mail and password. Accounts are created by hand in the Firebase
 * console - this is a two person app, there is no self service registration.
 */
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './app';
import { COL, type UserProfile } from '@/data/types';

/** the session survives restarts and works offline once established */
void setPersistence(auth, browserLocalPersistence);

export function watchUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

const DEFAULT_PROFILE: Omit<UserProfile, 'email' | 'displayName'> = {
  reminderEnabled: false,
  reminderTime: '20:00',
  fcmTokens: [],
  tz: 'Europe/Berlin',
};

/** creates the profile document on first sign in, then returns it */
export async function ensureProfile(user: User): Promise<UserProfile> {
  const ref = doc(db, COL.users, user.uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return snapshot.data() as UserProfile;

  const displayName =
    user.displayName?.trim() ||
    (user.email ?? '').split('@')[0]?.replace(/^./, (c) => c.toUpperCase()) ||
    'Nutzer';
  const profile: UserProfile = { email: user.email ?? '', displayName, ...DEFAULT_PROFILE };
  await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
  return profile;
}

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Diese E-Mail-Adresse stimmt nicht.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-Mail oder Passwort stimmt nicht.';
    case 'auth/too-many-requests':
      return 'Zu viele Versuche. Bitte kurz warten.';
    case 'auth/network-request-failed':
      return 'Keine Verbindung. Beim ersten Anmelden wird Internet gebraucht.';
    default:
      return 'Anmeldung fehlgeschlagen.';
  }
}
