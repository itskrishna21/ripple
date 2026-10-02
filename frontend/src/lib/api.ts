import { getFirebaseAuth } from "./firebase";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function getToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
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

function toApiCompetitor(data: {
  name: string;
  website: string;
  sources: Record<string, string>;
}) {
  return {
    name: data.name,
    website: data.website,
    pricingUrl: data.sources.pricing,
    changelogUrl: data.sources.changelog,
    careersUrl: data.sources.careers,
    blogUrl: data.sources.blog,
  };
}

export const createCompetitor = (data: {
  name: string;
  website: string;
  sources: Record<string, string>;
}) =>
  request<import("@/types").Competitor>("/competitors", {
    method: "POST",
    body: JSON.stringify(toApiCompetitor(data)),
  });

export const updateCompetitor = (
  id: string,
  data: { name?: string; website?: string; sources?: Record<string, string> },
) =>
  request<import("@/types").Competitor>(`/competitors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(
      data.sources
        ? toApiCompetitor({
            name: data.name ?? "",
            website: data.website ?? "",
            sources: data.sources,
          })
        : data,
    ),
  });

export const getMe = () => request<import("@/types").MeResponse>("/me");

export const discoverCompetitors = () =>
  request<import("@/types").DiscoverOutput>("/discover", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const subscribeCompetitors = (data: {
  competitors: Array<{
    name: string;
    website: string;
    pricingUrl?: string;
    changelogUrl?: string;
    careersUrl?: string;
    blogUrl?: string;
  }>;
}) =>
  request<{ competitors: import("@/types").Competitor[] }>(
    "/discover/subscribe",
    { method: "POST", body: JSON.stringify(data) },
  );

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

export async function getCompetitorAnalysis(
  id: string,
): Promise<import("@/types").Analysis | null> {
  const data = await request<
    import("@/types").Analysis | { competitorId: string; analysis: null }
  >(`/competitors/${id}/analysis`);
  // Backend returns { competitorId, analysis: null } when none exists yet
  if ("analysis" in data && data.analysis === null) return null;
  return data as import("@/types").Analysis;
}

// Ops (no auth needed)
export async function getReady(): Promise<import("@/types").ReadyResponse> {
  const res = await fetch(`${BASE}/ready`);
  return res.json();
}

export async function getMetrics(): Promise<import("@/types").MetricsResponse> {
  const res = await fetch(`${BASE}/metrics`);
  return res.json();
}
