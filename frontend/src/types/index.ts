export type SourceKey = "pricing" | "changelog" | "careers" | "blog";

export type Competitor = {
  id: string;
  company_id: string;
  name: string;
  website: string;
  sources: Partial<Record<SourceKey, string>>;
  created_at: string;
  updated_at: string;
};

export type Signal = {
  id: string;
  snapshotId: string;
  sourceKey: SourceKey;
  category:
    | "pricing_change"
    | "new_feature"
    | "deprecation"
    | "hiring"
    | "funding_or_news"
    | "messaging_change"
    | "other";
  changeType: "added" | "removed" | "modified";
  severity: 1 | 2 | 3 | 4 | 5;
  payload: Record<string, unknown>;
  createdAt: string;
};

// Shape returned by the API (camelCase)
export type Analysis = {
  id: string;
  snapshotId: string;
  previousSnapshotId: string | null;
  competitorId: string;
  weekStart: string;
  threatScore: number;
  scoreBreakdown: Record<string, number>;
  summary: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
  isBaseline: boolean;
  createdAt: string;
  updatedAt: string;
  signals?: Signal[];
};

// Client-side joined shape for dashboard/list views
export type CompetitorAnalysis = {
  competitor: Competitor;
  analysis: Analysis | null;
};

export type ReadyResponse = {
  status: string;
  db: string;
  queueDepths: Record<string, number>;
  snapshots24h: Record<string, number>;
  stuckSnapshots: number;
};

export type MetricsResponse = {
  totals: {
    competitors: number;
    snapshots: number;
    analyses: number;
    signals: number;
    failedJobs: number;
  };
  snapshotsByStatus: Record<string, number>;
  uptime: number;
  memoryMb: number;
};
