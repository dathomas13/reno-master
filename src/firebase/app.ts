/**
 * Firebase bootstrap.
 *
 * Firestore runs with persistent local caching, so every read is served from the device
 * first and every write is queued locally when there is no network. That is what makes
 * the app usable on a building site with no reception.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

export const app: FirebaseApp = initializeApp(
  isFirebaseConfigured
    ? config
    : {
        // placeholder project so the preview starts before Firebase exists
        apiKey: 'demo',
        projectId: 'demo-reno-master',
        appId: 'demo',
        storageBucket: 'demo-reno-master.appspot.com',
        authDomain: 'demo-reno-master.firebaseapp.com',
      },
);

export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
});

/*
 * Not getAuth(): that brings the popup/redirect resolver for Google sign-in along, and on
 * phones (the Android WebView included) Firebase initialises it at start-up and *waits* for
 * it - an iframe and scripts from the auth domain. With no network that fails fast, with
 * bad reception it hangs, and the whole app sat on "Wird geladen…". This app only signs
 * in with e-mail and password, so it needs no resolver: the stored user comes straight
 * from the device. localStorage first, because that is where the session has been kept.
 */
export const auth: Auth = initializeAuth(app, {
  persistence: [browserLocalPersistence, indexedDBLocalPersistence],
});

if (useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export { APP_VERSION, APP_BUILD, APP_SHA, BUILD_DATE } from '@/lib/buildInfo';
