import { FirebaseAuthError } from "firebase-admin/auth";
import { getFirebaseAuth } from "./firebase";

export type PublicUser = {
  id: string;
  email: string;
};

export class UserExistsError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "UserExistsError";
  }
}

type FirebaseSignInResponse = {
  idToken: string;
  localId: string;
  email: string;
};

type FirebaseSignInError = {
  error?: {
    message?: string;
  };
};

function getFirebaseApiKey(): string {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("FIREBASE_API_KEY is not configured");
  }

  return apiKey;
}

export async function createUser(
  email: string,
  password: string,
): Promise<PublicUser> {
  try {
    const user = await getFirebaseAuth().createUser({
      email,
      password,
    });

    return {
      id: user.uid,
      email: user.email ?? email,
    };
  } catch (error) {
    if (error instanceof FirebaseAuthError && error.code === "auth/email-already-exists") {
      throw new UserExistsError();
    }

    throw error;
  }
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<{ token: string; user: PublicUser } | null> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${getFirebaseApiKey()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const data = (await response.json()) as FirebaseSignInResponse & FirebaseSignInError;

  if (!response.ok) {
    const message = data.error?.message ?? "";

    if (
      message === "INVALID_LOGIN_CREDENTIALS" ||
      message === "EMAIL_NOT_FOUND" ||
      message === "INVALID_PASSWORD"
    ) {
      return null;
    }

    throw new Error(message || "Firebase sign-in failed");
  }

  return {
    token: data.idToken,
    user: {
      id: data.localId,
      email: data.email,
    },
  };
}
