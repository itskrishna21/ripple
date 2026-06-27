/**
 * Integration tests for the snapshot pipeline:
 *   snapshotStart → insertSource → settleSnapshotIfComplete
 *
 * Uses a real Postgres database. Does NOT do live HTTP fetches — sources are
 * marked ok/failed directly so we can test settle logic in isolation.
 */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { getBoss, stopBoss } from "../queue/boss";
import {
  upsertSnapshot,
  insertSource,
  markSourceOk,
  markSourceFailed,
  countSourceStatuses,
  getSourcesForSnapshot,
} from "../service/snapshotSourceService";
import { settleSnapshotIfComplete } from "../pipeline/settle";
import { blobStore } from "../storage/blobStore";

const WEEK = "2025-01-06";

async function insertCompany(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO companies (id, name) VALUES ($1, 'Test Co') ON CONFLICT DO NOTHING`,
    [id],
  );
}

async function insertCompetitor(
  id: string,
  companyId: string,
  name: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO competitors (id, company_id, name, website)
     VALUES ($1, $2, $3, 'https://example.com')
     ON CONFLICT (id) DO NOTHING`,
    [id, companyId, name],
  );
}

describe("pipeline — service layer", () => {
  const companyId = randomUUID();
  const competitorId = randomUUID();
  let snapshotId: string;

  beforeAll(async () => {
    await getBoss(); // ensure queues are created
    await insertCompany(companyId);
    await insertCompetitor(competitorId, companyId, `Pipeline Test ${Date.now()}`);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM competitors WHERE id = $1", [competitorId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    await stopBoss();
    // pool.end() omitted — later describe blocks in this file share the pool.
  });

  it("upsertSnapshot creates a pending snapshot", async () => {
    const snap = await upsertSnapshot(competitorId, WEEK);
    expect(snap.id).toBeTruthy();
    expect(snap.status).toBe("pending");
    snapshotId = snap.id;
  });

  it("upsertSnapshot is idempotent — returns the same row on repeat", async () => {
    const snap2 = await upsertSnapshot(competitorId, WEEK);
    expect(snap2.id).toBe(snapshotId);
  });

  it("insertSource creates a pending source row", async () => {
    await insertSource(snapshotId, "pricing");
    const sources = await getSourcesForSnapshot(snapshotId);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.sourceKey).toBe("pricing");
    expect(sources[0]!.status).toBe("pending");
  });

  it("insertSource is idempotent (ON CONFLICT DO NOTHING)", async () => {
    await insertSource(snapshotId, "pricing");
    const sources = await getSourcesForSnapshot(snapshotId);
    expect(sources).toHaveLength(1); // no duplicate
  });

  it("settle does nothing while a source is still pending", async () => {
    await insertSource(snapshotId, "changelog");
    await settleSnapshotIfComplete(snapshotId, competitorId);
    // pricing is pending, changelog is pending — snapshot should stay pending
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(result.rows[0]!.status).toBe("pending");
  });

  it("markSourceOk records hash and storage key", async () => {
    await markSourceOk(snapshotId, "pricing", {
      contentHash: "abc123",
      storageKey: "fake/key",
      normalized: "some text",
    });
    const sources = await getSourcesForSnapshot(snapshotId);
    const pricing = sources.find((s) => s.sourceKey === "pricing")!;
    expect(pricing.status).toBe("ok");
    expect(pricing.contentHash).toBe("abc123");
    expect(pricing.storageKey).toBe("fake/key");
  });

  it("markSourceFailed records the error", async () => {
    await markSourceFailed(snapshotId, "changelog", "timeout");
    const sources = await getSourcesForSnapshot(snapshotId);
    const changelog = sources.find((s) => s.sourceKey === "changelog")!;
    expect(changelog.status).toBe("failed");
    expect(changelog.error).toBe("timeout");
  });

  it("settle transitions snapshot to 'partial' when ok>0 and failed>0", async () => {
    // pricing=ok, changelog=failed → partial
    await settleSnapshotIfComplete(snapshotId, competitorId);
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(result.rows[0]!.status).toBe("partial");
  });

  it("settle is idempotent — second call does nothing (already settled)", async () => {
    await settleSnapshotIfComplete(snapshotId, competitorId);
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(result.rows[0]!.status).toBe("partial"); // unchanged
  });

  it("countSourceStatuses returns correct counts", async () => {
    const counts = await countSourceStatuses(snapshotId);
    expect(counts.pending).toBe(0);
    expect(counts.ok).toBe(1);
    expect(counts.failed).toBe(1);
  });
});

describe("pipeline — all-failed settle path", () => {
  const companyId = randomUUID();
  const competitorId = randomUUID();

  beforeAll(async () => {
    await insertCompany(companyId);
    await insertCompetitor(
      competitorId,
      companyId,
      `AllFail Test ${Date.now()}`,
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM competitors WHERE id = $1", [competitorId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    // pool stays open for subsequent describe blocks
  });

  it("settle transitions to 'failed' when all sources failed", async () => {
    const snap = await upsertSnapshot(competitorId, "2025-02-03");
    await insertSource(snap.id, "careers");
    await markSourceFailed(snap.id, "careers", "blocked_url");
    await settleSnapshotIfComplete(snap.id, competitorId);
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [snap.id],
    );
    expect(result.rows[0]!.status).toBe("failed");
  });
});

describe("pipeline — blobStore", () => {
  const competitorId = randomUUID();
  const companyId = randomUUID();

  beforeAll(async () => {
    await insertCompany(companyId);
    await insertCompetitor(competitorId, companyId, `Blob Test ${Date.now()}`);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM competitors WHERE id = $1", [competitorId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    await pool.end();
  });

  it("put stores raw HTML and get retrieves it", async () => {
    const snap = await upsertSnapshot(competitorId, "2025-03-03");
    const html = "<html><body>Test content</body></html>";
    const key = await blobStore.put(snap.id, "pricing", html);
    expect(key).toBe(`${snap.id}/pricing`);
    const retrieved = await blobStore.get(key);
    expect(retrieved).toBe(html);
  });

  it("put is idempotent — second write updates content", async () => {
    const snap = await upsertSnapshot(competitorId, "2025-04-07");
    await blobStore.put(snap.id, "changelog", "old content");
    await blobStore.put(snap.id, "changelog", "new content");
    const key = `${snap.id}/changelog`;
    const retrieved = await blobStore.get(key);
    expect(retrieved).toBe("new content");
  });
});
