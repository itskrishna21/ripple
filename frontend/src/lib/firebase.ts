import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
};

/**
 * Returns the Firebase Auth instance — always call this inside event handlers
 * or useEffect, never at module scope. Next.js evaluates modules server-side
 * during prerender; Firebase Auth only works in the browser.
 */
export function getFirebaseAuth() {
  if (typeof window === "undefined") return null;
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}
