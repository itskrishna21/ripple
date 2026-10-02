"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { postAuthPath, useAuth } from "@/context/auth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? postAuthPath(user) : "/login");
    }
  }, [user, loading, router]);

  return null;
}
