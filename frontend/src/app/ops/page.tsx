"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Cpu, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReady, getMetrics } from "@/lib/api";
import { cn } from "@/lib/utils";

function MetricRow({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/8 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={cn("text-xs text-white", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        ok ? "bg-emerald-400" : "bg-red-400",
      )}
    />
  );
}

export default function OpsPage() {
  const { data: ready, error: readyError } = useQuery({
    queryKey: ["ready"],
    queryFn: getReady,
    refetchInterval: 15_000,
  });

  const { data: metrics, error: metricsError } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
    refetchInterval: 15_000,
  });

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const apiDown = !!readyError || !!metricsError;

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Ops</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Live system health — auto-refreshes every 15 seconds.
        </p>
      </div>

      {/* Status header */}
      <div className="flex items-center gap-2 mb-6">
        {apiDown ? (
          <>
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-sm text-red-400 font-medium">API unreachable</span>
          </>
        ) : ready ? (
          <>
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">All systems operational</span>
            {ready.stuckSnapshots > 0 && (
              <Badge variant="warning" className="ml-2">
                {ready.stuckSnapshots} stuck snapshot{ready.stuckSnapshots !== 1 ? "s" : ""}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-sm text-zinc-600">Connecting…</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Database + API */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database size={14} className="text-zinc-500" />
              <CardTitle>Infrastructure</CardTitle>
            </div>
          </CardHeader>
          <MetricRow label="API" value={apiDown ? "unreachable" : "reachable"} />
          <MetricRow label="Database" value={ready?.db ?? "—"} />
          <MetricRow
            label="Stuck snapshots"
            value={ready?.stuckSnapshots ?? "—"}
          />
          {metrics && (
            <>
              <MetricRow label="Memory" value={`${metrics.memoryMb} MB`} />
              <MetricRow label="Uptime" value={formatUptime(metrics.uptime)} />
            </>
          )}
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-zinc-500" />
              <CardTitle>Totals</CardTitle>
            </div>
          </CardHeader>
          {metrics ? (
            <>
              <MetricRow label="Competitors" value={metrics.totals.competitors} mono />
              <MetricRow label="Snapshots" value={metrics.totals.snapshots} mono />
              <MetricRow label="Analyses" value={metrics.totals.analyses} mono />
              <MetricRow label="Signals" value={metrics.totals.signals} mono />
              <MetricRow
                label="Failed jobs (DLQ)"
                value={metrics.totals.failedJobs}
                mono
              />
            </>
          ) : (
            <p className="text-xs text-zinc-600">Loading…</p>
          )}
        </Card>

        {/* Queue depths */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-zinc-500" />
              <CardTitle>Queue Depths</CardTitle>
              <CardDescription>Jobs waiting to be processed</CardDescription>
            </div>
          </CardHeader>
          {ready?.queueDepths && Object.keys(ready.queueDepths).length > 0 ? (
            Object.entries(ready.queueDepths)
              .sort(([, a], [, b]) => b - a)
              .map(([queue, count]) => (
                <div key={queue} className="flex items-center justify-between py-2.5 border-b border-white/8 last:border-0">
                  <span className="text-xs text-zinc-500 font-mono">{queue}</span>
                  <span
                    className={cn(
                      "text-xs font-mono tabular-nums",
                      count > 0 ? "text-amber-400" : "text-zinc-600",
                    )}
                  >
                    {count}
                  </span>
                </div>
              ))
          ) : (
            <p className="text-xs text-zinc-600 py-2">All queues empty</p>
          )}
        </Card>

        {/* Snapshot pipeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-zinc-500" />
              <CardTitle>Snapshot Pipeline (24h)</CardTitle>
            </div>
          </CardHeader>
          {ready?.snapshots24h && Object.keys(ready.snapshots24h).length > 0 ? (
            Object.entries(ready.snapshots24h).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between py-2.5 border-b border-white/8 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot
                    ok={status === "analyzed" || status === "completed"}
                  />
                  <span className="text-xs text-zinc-500 font-mono">{status}</span>
                </div>
                <span className="text-xs text-white font-mono tabular-nums">{count}</span>
              </div>
            ))
          ) : metrics?.snapshotsByStatus && Object.keys(metrics.snapshotsByStatus).length > 0 ? (
            Object.entries(metrics.snapshotsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between py-2.5 border-b border-white/8 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot ok={status === "analyzed" || status === "completed"} />
                  <span className="text-xs text-zinc-500 font-mono">{status}</span>
                </div>
                <span className="text-xs text-white font-mono tabular-nums">{count}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-600 py-2">No snapshots in last 24h</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
