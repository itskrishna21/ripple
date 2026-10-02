"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Zap } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  const {
    user,
    loading,
    logout,
    resendVerification,
    completeEmailVerification,
    refreshUser,
  } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const handledCode = useRef(false);

  // Handle Firebase email action link (?mode=verifyEmail&oobCode=...)
  useEffect(() => {
    if (typeof window === "undefined" || handledCode.current) return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const oobCode = params.get("oobCode");
    if (mode !== "verifyEmail" || !oobCode) return;

    handledCode.current = true;
    let cancelled = false;
    setStatus("verifying");
    completeEmailVerification(oobCode)
      .then((verifiedUser) => {
        if (cancelled) return;
        window.history.replaceState({}, "", "/verify-email");
        router.replace(verifiedUser?.emailVerified ? "/dashboard" : "/login");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
    return () => {
      cancelled = true;
    };
  }, [completeEmailVerification, router]);

  // Already verified → dashboard
  useEffect(() => {
    if (!loading && user?.emailVerified && status !== "verifying") {
      router.replace("/dashboard");
    }
  }, [user, loading, router, status]);

  // Not signed in (and not mid-verify from link) → login
  useEffect(() => {
    if (loading || status === "verifying") return;
    if (!user) router.replace("/login");
  }, [user, loading, router, status]);

  // Poll while waiting — covers Firebase hosted handler → continueUrl without oobCode
  useEffect(() => {
    if (!user || user.emailVerified || status === "verifying") return;
    const id = window.setInterval(() => {
      void refreshUser().then((u) => {
        if (u?.emailVerified) router.replace("/dashboard");
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [user, status, refreshUser, router]);

  const handleResend = async () => {
    setResending(true);
    setMessage("");
    try {
      await resendVerification();
      setMessage("Verification email sent — check your inbox.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setResending(false);
    }
  };

  if (loading || status === "verifying" || (!user && status !== "error")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center">
          <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-xs text-zinc-500">
            {status === "verifying" ? "Verifying your email…" : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white">
            <Zap size={14} className="text-zinc-900" />
          </div>
          <span className="text-base font-semibold text-white tracking-tight">Ripple</span>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 mx-auto mb-5">
          <Mail size={22} className="text-zinc-400" />
        </div>

        <h1 className="text-xl font-semibold text-white mb-2">Check your email</h1>
        <p className="text-sm text-zinc-500 mb-1">
          We sent a verification link to
        </p>
        <p className="text-sm text-white mb-6">{user?.email}</p>
        <p className="text-xs text-zinc-600 mb-8">
          Click the link in that email to activate your account. This page updates
          automatically once you verify.
        </p>

        {message && (
          <p
            className={`text-xs rounded-md px-3 py-2 mb-4 ${
              status === "error" || message.toLowerCase().includes("could not")
                ? "text-red-400 bg-red-500/10 border border-red-500/20"
                : "text-zinc-400 bg-white/5 border border-white/10"
            }`}
          >
            {message}
          </p>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            loading={resending}
            onClick={handleResend}
            className="w-full"
          >
            Resend verification email
          </Button>
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
