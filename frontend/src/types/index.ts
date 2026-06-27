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
  snapshot_id: string;
  source_key: SourceKey;
  category:
    | "pricing_change"
    | "new_feature"
    | "deprecation"
    | "hiring"
    | "funding_or_news"
    | "messaging_change"
    | "other";
  change_type: "added" | "removed" | "modified";
  severity: 1 | 2 | 3 | 4 | 5;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Analysis = {
  id: string;
  snapshot_id: string;
  previous_snapshot_id: string | null;
  threat_score: number;
  score_breakdown: Record<string, number>;
  summary: string;
  model: string;
  prompt_version: string;
  policy_version: string;
  is_baseline: boolean;
  created_at: string;
  signals?: Signal[];
};

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
