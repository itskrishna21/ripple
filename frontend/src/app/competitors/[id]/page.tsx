"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  TrendingUp,
  Tag,
  Layers,
  Briefcase,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThreatBadge, Badge } from "@/components/ui/badge";
import { getCompetitorAnalysis, getCompetitors } from "@/lib/api";
import type { Signal, SourceKey } from "@/types";
import { cn } from "@/lib/utils";

const categoryLabel: Record<string, string> = {
  pricing_change: "Pricing",
  new_feature: "New Feature",
  deprecation: "Deprecation",
  hiring: "Hiring",
  funding_or_news: "News",
  messaging_change: "Messaging",
  other: "Other",
};

const categoryIcon: Record<string, React.ElementType> = {
  pricing_change: Tag,
  new_feature: TrendingUp,
  deprecation: AlertTriangle,
  hiring: Briefcase,
  funding_or_news: FileText,
  messaging_change: Layers,
  other: FileText,
};

const severityColor = (s: number) => {
  if (s >= 5) return "text-red-400";
  if (s >= 4) return "text-orange-400";
  if (s >= 3) return "text-amber-400";
  return "text-zinc-500";
};

function SignalRow({ signal }: { signal: Signal }) {
  const Icon = categoryIcon[signal.category] ?? FileText;
  const payload = signal.payload as Record<string, string>;

  return (
    <div className="flex gap-3 py-3 border-b border-white/8 last:border-0">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 shrink-0 mt-0.5">
        <Icon size={13} className="text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-medium text-white">
            {categoryLabel[signal.category] ?? signal.category}
          </span>
          <Badge variant="muted">{signal.source_key}</Badge>
          <Badge
            variant={
              signal.change_type === "added"
                ? "success"
                : signal.change_type === "removed"
                ? "danger"
                : "warning"
            }
          >
            {signal.change_type}
          </Badge>
          <span className={cn("text-xs font-mono ml-auto", severityColor(signal.severity))}>
            sev {signal.severity}/5
          </span>
        </div>
        {payload.before && (
          <p className="text-xs text-zinc-600 line-clamp-2 font-mono bg-red-500/5 border border-red-500/10 rounded px-2 py-1 mb-1">
            − {payload.before}
          </p>
        )}
        {payload.after && (
          <p className="text-xs text-zinc-500 line-clamp-2 font-mono bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1">
            + {payload.after}
          </p>
        )}
        {!payload.before && !payload.after && payload.text && (
          <p className="text-xs text-zinc-500 line-clamp-3">{payload.text}</p>
        )}
      </div>
    </div>
  );
}

function ScoreBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([cat, pts]) => (
        <div key={cat} className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-32 shrink-0">{categoryLabel[cat] ?? cat}</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-white/60 transition-all duration-500"
              style={{ width: `${Math.min((pts / 100) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">{pts}</span>
        </div>
      ))}
    </div>
  );
}

export default function CompetitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: competitors } = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getCompetitorAnalysis(id),
    enabled: !!id,
  });

  const competitor = competitors?.find((c) => c.id === id);

  return (
    <AppShell>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={13} />
        Back
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">Loading…</div>
      ) : !analysis ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <FileText size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">No analysis yet</p>
          <p className="text-xs text-zinc-700 mt-1">Analysis runs automatically each week.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold text-white">
                {competitor?.name ?? "Competitor"}
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                {competitor?.website} · Analyzed{" "}
                {new Date(analysis.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <ThreatBadge score={analysis.threat_score} />
          </div>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              {analysis.is_baseline && (
                <CardDescription>Baseline snapshot — no previous data to compare.</CardDescription>
              )}
            </CardHeader>
            <p className="text-sm text-zinc-400 leading-relaxed">{analysis.summary}</p>
          </Card>

          {/* Score breakdown */}
          {Object.keys(analysis.score_breakdown).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
                <CardDescription>Threat score = {analysis.threat_score} / 100</CardDescription>
              </CardHeader>
              <ScoreBreakdown breakdown={analysis.score_breakdown} />
            </Card>
          )}

          {/* Signals */}
          {analysis.signals && analysis.signals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Signals</CardTitle>
                <CardDescription>
                  {analysis.signals.length} change{analysis.signals.length !== 1 ? "s" : ""} detected
                </CardDescription>
              </CardHeader>
              <div>
                {analysis.signals.map((s) => (
                  <SignalRow key={s.id} signal={s} />
                ))}
              </div>
            </Card>
          ) : (
            <Card className="text-center py-8">
              <p className="text-sm text-zinc-600">No signals detected — no meaningful changes found.</p>
            </Card>
          )}

          {/* Meta */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="muted">model: {analysis.model}</Badge>
            <Badge variant="muted">prompt v{analysis.prompt_version}</Badge>
            <Badge variant="muted">policy v{analysis.policy_version}</Badge>
            {analysis.is_baseline && <Badge variant="muted">baseline</Badge>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
