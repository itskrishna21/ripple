"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  applyActionCode,
  reload,
  type ActionCodeSettings,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { apiSignup } from "@/lib/api";

function verificationSettings(): ActionCodeSettings {
  return {
    url: `${window.location.origin}/verify-email`,
    handleCodeInApp: true,
  };
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signin: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, companyName: string) => Promise<User>;
  logout: () => Promise<void>;
  resendVerification: () => Promise<void>;
  completeEmailVerification: (oobCode: string) => Promise<User | null>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signin = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth()!;
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return user;
  }, []);

  const signup = useCallback(
    async (email: string, password: string, companyName: string) => {
      await apiSignup(email, password, companyName);
      const auth = getFirebaseAuth()!;
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(user, verificationSettings());
      return user;
    },
    [],
  );

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth()!;
    await signOut(auth);
  }, []);

  const resendVerification = useCallback(async () => {
    const auth = getFirebaseAuth()!;
    const current = auth.currentUser;
    if (!current) throw new Error("Not signed in");
    await sendEmailVerification(current, verificationSettings());
  }, []);

  const refreshUser = useCallback(async () => {
    const auth = getFirebaseAuth()!;
    const current = auth.currentUser;
    if (!current) return null;
    await reload(current);
    await current.getIdToken(true);
    setUser(auth.currentUser);
    return auth.currentUser;
  }, []);

  const completeEmailVerification = useCallback(
    async (oobCode: string) => {
      const auth = getFirebaseAuth()!;
      await applyActionCode(auth, oobCode);
      return refreshUser();
    },
    [refreshUser],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signin,
        signup,
        logout,
        resendVerification,
        completeEmailVerification,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function postAuthPath(user: User) {
  return user.emailVerified ? "/dashboard" : "/verify-email";
}
