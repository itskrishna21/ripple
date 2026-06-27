"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, Building2, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ThreatBadge, Badge } from "@/components/ui/badge";
import { getAllAnalyses } from "@/lib/api";
import type { CompetitorAnalysis } from "@/types";

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color =
    score >= 60 ? "#f87171" : score >= 30 ? "#fbbf24" : "#34d399";

  return (
    <svg width="52" height="52" className="rotate-[-90deg]">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1c1c1f" strokeWidth="4" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, sub }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card className="flex items-start gap-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 border border-white/8 shrink-0">
        <Icon size={15} className="text-zinc-400" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function CompetitorCard({ item }: { item: CompetitorAnalysis }) {
  const { competitor, analysis } = item;
  const score = analysis?.threatScore ?? null;

  return (
    <Link href={`/competitors/${competitor.id}`}>
      <Card className="hover:border-white/15 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-white truncate">{competitor.name}</h3>
                {analysis?.isBaseline && (
                <Badge variant="muted">baseline</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-600 truncate mb-3">{competitor.website}</p>

            {analysis ? (
              <>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {analysis.summary}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <ThreatBadge score={analysis.threatScore} />
                  <span className="text-xs text-zinc-600">
                    {new Date(analysis.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-600">No analysis yet — runs weekly.</p>
            )}
          </div>

          {score !== null && (
            <div className="relative shrink-0">
              <ScoreRing score={score} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-semibold text-white tabular-nums">
                  {score}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-white/8 text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">
          View analysis
          <ArrowRight size={11} />
        </div>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analyses"],
    queryFn: getAllAnalyses,
  });

  const analyses = data ?? [];
  const withAnalysis = analyses.filter((a) => a.analysis !== null);
  const avgScore =
    withAnalysis.length > 0
      ? Math.round(
          withAnalysis.reduce((s, a) => s + (a.analysis?.threatScore ?? 0), 0) /
            withAnalysis.length,
        )
      : 0;
  const high = withAnalysis.filter((a) => (a.analysis?.threatScore ?? 0) >= 60).length;

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Weekly competitive intelligence across your tracked companies.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={Building2}
          label="Competitors tracked"
          value={analyses.length}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg threat score"
          value={withAnalysis.length > 0 ? avgScore : "—"}
          sub={withAnalysis.length > 0 ? "across analyzed competitors" : "no analyses yet"}
        />
        <StatCard
          icon={high > 0 ? AlertTriangle : CheckCircle2}
          label="High-threat alerts"
          value={high}
          sub={high > 0 ? "score ≥ 60 — review soon" : "all clear"}
        />
      </div>

      {/* Competitor grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
          Loading…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-red-400 text-sm">
          Failed to load data
        </div>
      ) : analyses.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm font-medium text-zinc-400">No competitors yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Go to Competitors and add your first one.
          </p>
          <Link
            href="/competitors"
            className="mt-4 text-xs text-white bg-white/10 hover:bg-white/15 transition-colors px-4 py-2 rounded-md"
          >
            Add competitor
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {analyses.map((item) => (
            <CompetitorCard key={item.competitor.id} item={item} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
