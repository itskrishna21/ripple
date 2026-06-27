import { getWeekStart } from "../lib/week";
import { pool } from "../lib/db";
import {
  CompetitorSnapshot,
  SnapshotSources,
  SnapshotStatus,
  createEmptySources,
} from "../schema/snapshot";
import { CompetitorNotFoundError, SnapshotNotFoundError } from "../http/errors";
import { getCompetitorById } from "./competitorService";

export { SnapshotNotFoundError };

type SnapshotRow = {
  id: string;
  competitor_id: string;
  week_start: Date;
  status: SnapshotStatus;
  sources: SnapshotSources;
  created_at: Date;
  updated_at: Date;
};

function rowToSnapshot(row: SnapshotRow): CompetitorSnapshot {
  return {
    id: row.id,
    competitorId: row.competitor_id,
    weekStart: row.week_start.toISOString().slice(0, 10),
    status: row.status,
    sources: row.sources,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function assertCompetitorAccess(
  competitorId: string,
  companyId: string,
): Promise<void> {
  const competitor = await getCompetitorById(competitorId, companyId);

  if (!competitor) {
    throw new CompetitorNotFoundError();
  }
}

export async function getSnapshotsForCompetitor(
  competitorId: string,
  companyId: string,
): Promise<CompetitorSnapshot[]> {
  await assertCompetitorAccess(competitorId, companyId);

  const result = await pool.query<SnapshotRow>(
    `
      SELECT
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
      FROM competitor_snapshots
      WHERE competitor_id = $1
      ORDER BY week_start DESC
    `,
    [competitorId],
  );

  return result.rows.map(rowToSnapshot);
}

export async function getSnapshotForWeek(
  competitorId: string,
  companyId: string,
  weekStart: string = getWeekStart(),
): Promise<CompetitorSnapshot | null> {
  await assertCompetitorAccess(competitorId, companyId);

  const result = await pool.query<SnapshotRow>(
    `
      SELECT
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
      FROM competitor_snapshots
      WHERE competitor_id = $1 AND week_start = $2
    `,
    [competitorId, weekStart],
  );

  const row = result.rows[0];
  return row ? rowToSnapshot(row) : null;
}

export async function getLatestSnapshot(
  competitorId: string,
  companyId: string,
): Promise<CompetitorSnapshot | null> {
  await assertCompetitorAccess(competitorId, companyId);

  const result = await pool.query<SnapshotRow>(
    `
      SELECT
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
      FROM competitor_snapshots
      WHERE competitor_id = $1
      ORDER BY week_start DESC
      LIMIT 1
    `,
    [competitorId],
  );

  const row = result.rows[0];
  return row ? rowToSnapshot(row) : null;
}

export async function createSnapshotForWeek(
  competitorId: string,
  companyId: string,
  weekStart: string = getWeekStart(),
): Promise<CompetitorSnapshot> {
  await assertCompetitorAccess(competitorId, companyId);

  const result = await pool.query<SnapshotRow>(
    `
      INSERT INTO competitor_snapshots (
        competitor_id,
        week_start,
        status,
        sources
      )
      VALUES ($1, $2, 'pending', $3)
      ON CONFLICT (competitor_id, week_start)
      DO UPDATE SET
        updated_at = NOW()
      RETURNING
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
    `,
    [competitorId, weekStart, createEmptySources()],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create snapshot");
  }

  return rowToSnapshot(row);
}

export async function updateSnapshot(
  snapshotId: string,
  competitorId: string,
  companyId: string,
  updates: {
    status?: SnapshotStatus;
    sources?: SnapshotSources;
  },
): Promise<CompetitorSnapshot> {
  await assertCompetitorAccess(competitorId, companyId);

  const existing = await pool.query<SnapshotRow>(
    `
      SELECT
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
      FROM competitor_snapshots
      WHERE id = $1 AND competitor_id = $2
    `,
    [snapshotId, competitorId],
  );

  const current = existing.rows[0];
  if (!current) {
    throw new SnapshotNotFoundError();
  }

  const result = await pool.query<SnapshotRow>(
    `
      UPDATE competitor_snapshots
      SET
        status = $3,
        sources = $4,
        updated_at = NOW()
      WHERE id = $1 AND competitor_id = $2
      RETURNING
        id,
        competitor_id,
        week_start,
        status,
        sources,
        created_at,
        updated_at
    `,
    [
      snapshotId,
      competitorId,
      updates.status ?? current.status,
      updates.sources ?? current.sources,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new SnapshotNotFoundError();
  }

  return rowToSnapshot(row);
}

export { getWeekStart };
