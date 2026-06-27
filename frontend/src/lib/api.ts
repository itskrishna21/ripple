import { auth } from "./firebase";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function getToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Auth (no token needed)
export async function apiSignup(email: string, password: string, companyName: string) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, companyName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Competitors
export const getCompetitors = () =>
  request<{ competitors: import("@/types").Competitor[] }>("/competitors").then(
    (r) => r.competitors,
  );

export const createCompetitor = (data: {
  name: string;
  website: string;
  sources: Record<string, string>;
}) => request<{ competitor: import("@/types").Competitor }>("/competitors", {
  method: "POST",
  body: JSON.stringify(data),
}).then((r) => r.competitor);

export const updateCompetitor = (
  id: string,
  data: { name?: string; website?: string; sources?: Record<string, string> },
) =>
  request<{ competitor: import("@/types").Competitor }>(`/competitors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.competitor);

export const deleteCompetitor = (id: string) =>
  request<void>(`/competitors/${id}`, { method: "DELETE" });

// Analysis
export const getAllAnalyses = () =>
  request<import("@/types").CompetitorAnalysis[]>("/analysis");

export const getCompetitorAnalysis = (id: string) =>
  request<import("@/types").Analysis>(`/competitors/${id}/analysis`);

// Ops (no auth needed)
export async function getReady(): Promise<import("@/types").ReadyResponse> {
  const res = await fetch(`${BASE}/ready`);
  return res.json();
}

export async function getMetrics(): Promise<import("@/types").MetricsResponse> {
  const res = await fetch(`${BASE}/metrics`);
  return res.json();
}
