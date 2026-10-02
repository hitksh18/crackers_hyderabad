import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredKeys.filter((k) => !firebaseConfig[k]);
export const isFirebaseConfigValid = missingKeys.length === 0;
export const firebaseConfigError = missingKeys.length
  ? `Missing Firebase config: ${missingKeys.join(', ')} — check client/.env`
  : null;

if (import.meta.env.DEV && missingKeys.length) {
  console.error('[AUTH ERROR] Firebase config incomplete:', firebaseConfigError);
}

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error('[AUTH ERROR] Firebase initializeApp failed:', e?.message || e);
  // Re-throw so AuthContext can surface a clear error instead of hanging.
  throw e;
}

export const auth = getAuth(app);
export const db = getFirestore(app);

/* Pin local persistence explicitly. Firebase defaults to local for web, but
   this makes the intent clear and survives any future SDK default changes.
   .catch() swallows the (non-fatal) error that occurs if this runs during a
   pending redirect — the session is already being handled elsewhere. */
setPersistence(auth, browserLocalPersistence).catch((e) => {
  if (import.meta.env.DEV) console.warn('[AUTH] setPersistence warning:', e?.message || e);
});

export default app;
