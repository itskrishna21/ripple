"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", companyName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(form.email, form.password, form.companyName);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white">
            <Zap size={14} className="text-zinc-900" />
          </div>
          <span className="text-base font-semibold text-white tracking-tight">Ripple</span>
        </div>

        <h1 className="text-xl font-semibold text-white mb-1">Create account</h1>
        <p className="text-sm text-zinc-500 mb-7">
          Start tracking competitors in minutes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Company name"
            placeholder="Acme Inc."
            value={form.companyName}
            onChange={set("companyName")}
            required
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={set("email")}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={set("password")}
            required
            minLength={8}
          />

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="text-xs text-zinc-600 text-center mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
