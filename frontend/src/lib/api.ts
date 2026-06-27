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

// Competitors — API returns arrays/objects directly (no wrapper)
export const getCompetitors = () =>
  request<import("@/types").Competitor[]>("/competitors");

export const createCompetitor = (data: {
  name: string;
  website: string;
  sources: Record<string, string>;
}) => request<import("@/types").Competitor>("/competitors", {
  method: "POST",
  body: JSON.stringify(data),
});

export const updateCompetitor = (
  id: string,
  data: { name?: string; website?: string; sources?: Record<string, string> },
) =>
  request<import("@/types").Competitor>(`/competitors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteCompetitor = (id: string) =>
  request<void>(`/competitors/${id}`, { method: "DELETE" });

// Analysis
// /analysis returns Analysis[] (one per competitor); we join with competitors client-side
export const getAnalyses = () =>
  request<import("@/types").Analysis[]>("/analysis");

export async function getAllAnalyses(): Promise<import("@/types").CompetitorAnalysis[]> {
  const [competitors, analyses] = await Promise.all([
    getCompetitors(),
    getAnalyses(),
  ]);
  const byCompetitorId = new Map(analyses.map((a) => [a.competitorId, a]));
  return competitors.map((c) => ({
    competitor: c,
    analysis: byCompetitorId.get(c.id) ?? null,
  }));
}

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
