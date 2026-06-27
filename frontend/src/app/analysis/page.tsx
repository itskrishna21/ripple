"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ThreatBadge, Badge } from "@/components/ui/badge";
import { getAllAnalyses } from "@/lib/api";

export default function AnalysisPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["analyses"],
    queryFn: getAllAnalyses,
  });

  const sorted = [...data].sort(
    (a, b) =>
      (b.analysis?.threatScore ?? -1) - (a.analysis?.threatScore ?? -1),
  );

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Analysis</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Latest threat analysis for each tracked competitor, sorted by score.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <BarChart3 size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">No analyses yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/8 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Competitor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Threat score</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Top signals</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Analyzed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {sorted.map(({ competitor, analysis }) => (
                <tr key={competitor.id} className="hover:bg-white/2 transition-colors group">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{competitor.name}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {competitor.website.replace(/^https?:\/\//, "")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {analysis ? (
                      <ThreatBadge score={analysis.threatScore} />
                    ) : (
                      <span className="text-xs text-zinc-600">No data</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {analysis && Object.keys(analysis.scoreBreakdown).length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {Object.entries(analysis.scoreBreakdown)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 2)
                          .map(([cat, pts]) => (
                            <Badge key={cat} variant="muted">
                              {cat.replace(/_/g, " ")} ({pts})
                            </Badge>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 tabular-nums">
                    {analysis
                      ? new Date(analysis.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/competitors/${competitor.id}`}
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors justify-end group-hover:text-zinc-400"
                    >
                      View
                      <ArrowRight size={11} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
