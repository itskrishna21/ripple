"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Globe, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  getCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
} from "@/lib/api";
import type { Competitor, SourceKey } from "@/types";
import { cn } from "@/lib/utils";

const SOURCE_KEYS: SourceKey[] = ["pricing", "changelog", "careers", "blog"];

type FormState = {
  name: string;
  website: string;
  sources: Record<string, string>;
};

const emptyForm = (): FormState => ({
  name: "",
  website: "",
  sources: { pricing: "", changelog: "", careers: "", blog: "" },
});

function CompetitorForm({
  initial,
  onSubmit,
  loading,
}: {
  initial: FormState;
  onSubmit: (data: FormState) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);

  const setField = (k: keyof Omit<FormState, "sources">) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const setSource = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, sources: { ...f.sources, [k]: e.target.value } }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Only include sources with values
        const sources = Object.fromEntries(
          Object.entries(form.sources).filter(([, v]) => v.trim()),
        );
        onSubmit({ ...form, sources });
      }}
      className="space-y-4"
    >
      <Input label="Company name" value={form.name} onChange={setField("name")} required placeholder="Stripe" />
      <Input label="Website" value={form.website} onChange={setField("website")} required placeholder="https://stripe.com" type="url" />

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Source URLs</p>
        <div className="rounded-md border border-white/8 divide-y divide-white/8">
          {SOURCE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-3 px-3 py-2">
              <span className="text-xs text-zinc-500 w-20 shrink-0 font-mono">{key}</span>
              <input
                type="url"
                value={form.sources[key] ?? ""}
                onChange={setSource(key)}
                placeholder={`https://.../${key}`}
                className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-700 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600">Leave blank to skip that source.</p>
      </div>

      <Button type="submit" loading={loading} className="w-full">
        Save competitor
      </Button>
    </form>
  );
}

export default function CompetitorsPage() {
  const qc = useQueryClient();
  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);

  const addMutation = useMutation({
    mutationFn: (data: FormState) =>
      createCompetitor({
        name: data.name,
        website: data.website,
        sources: data.sources,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitors"] });
      void qc.invalidateQueries({ queryKey: ["analyses"] });
      setAddOpen(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: FormState) =>
      updateCompetitor(editTarget!.id, {
        name: data.name,
        website: data.website,
        sources: data.sources,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitors"] });
      void qc.invalidateQueries({ queryKey: ["analyses"] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetitor(deleteTarget!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitors"] });
      void qc.invalidateQueries({ queryKey: ["analyses"] });
      setDeleteTarget(null);
    },
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Competitors</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {competitors.length} tracked
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus size={14} />
          Add competitor
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">Loading…</div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <Globe size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">No competitors yet</p>
          <p className="text-xs text-zinc-700 mt-1">Add one to start tracking.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/8 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Website</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Sources</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {competitors.map((c) => (
                <tr key={c.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3">
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.keys(c.sources ?? {}).length > 0 ? (
                        Object.keys(c.sources).map((k) => (
                          <Badge key={k} variant="muted">{k}</Badge>
                        ))
                      ) : (
                        <span className="text-zinc-700 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditTarget(c)}
                        className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add competitor"
        description="Ripple will fetch these URLs every week and analyze changes."
      >
        <CompetitorForm
          initial={emptyForm()}
          onSubmit={(d) => addMutation.mutate(d)}
          loading={addMutation.isPending}
        />
        {addMutation.isError && (
          <p className="text-xs text-red-400 mt-3">{String(addMutation.error)}</p>
        )}
      </Dialog>

      {/* Edit dialog */}
      {editTarget && (
        <Dialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          title={`Edit ${editTarget.name}`}
        >
          <CompetitorForm
            initial={{
              name: editTarget.name,
              website: editTarget.website,
              sources: Object.fromEntries(
                SOURCE_KEYS.map((k) => [k, (editTarget.sources as Record<string, string>)[k] ?? ""]),
              ),
            }}
            onSubmit={(d) => editMutation.mutate(d)}
            loading={editMutation.isPending}
          />
        </Dialog>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Dialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={`Delete ${deleteTarget.name}?`}
          description="This removes the competitor and all its snapshots and analysis. This cannot be undone."
        >
          <div className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="flex-1"
            >
              Delete
            </Button>
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}
