import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestoreInstance: Firestore | null = null;
let initAttempted = false;

function getFirebaseProjectId(): string | undefined {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

function getFirebaseCredentials():
  | {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }
  | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }
  return { projectId, clientEmail, privateKey };
}

export function getFirebaseAdminFirestore(): Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }
  if (initAttempted) {
    return null;
  }

  initAttempted = true;

  try {
    const existing = getApps();
    if (existing.length === 0) {
      const credentials = getFirebaseCredentials();
      const projectId = getFirebaseProjectId();

      if (credentials) {
        initializeApp({
          credential: cert(credentials),
          projectId: credentials.projectId,
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
          ...(projectId ? { projectId } : {}),
        });
      }
    }

    firestoreInstance = getFirestore();
    return firestoreInstance;
  } catch (error) {
    console.error("Firebase Admin initialization failed", error);
    return null;
  }
}

