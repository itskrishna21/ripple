import { pool } from "../lib/db";
import { SignalInput } from "../analysis/agent";

export type StoredSignal = {
  id: string;
  snapshotId: string;
  sourceKey: string;
  category: string;
  changeType: string;
  severity: number;
  payload: Record<string, unknown>;
};

type SignalRow = {
  id: string;
  snapshot_id: string;
  source_key: string;
  category: string;
  change_type: string;
  severity: number;
  payload: Record<string, unknown>;
};

function rowToSignal(row: SignalRow): StoredSignal {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    sourceKey: row.source_key,
    category: row.category,
    changeType: row.change_type,
    severity: row.severity,
    payload: row.payload,
  };
}

/**
 * Bulk-insert signals within an existing client transaction.
 * Caller is responsible for BEGIN/COMMIT/ROLLBACK.
 */
export async function insertSignals(
  client: import("pg").PoolClient,
  snapshotId: string,
  signals: SignalInput[],
): Promise<void> {
  if (signals.length === 0) return;

  const values = signals
    .map(
      (_, i) =>
        `($1, $${2 + i * 5}, $${3 + i * 5}, $${4 + i * 5}, $${5 + i * 5}, $${6 + i * 5})`,
    )
    .join(", ");

  const params: unknown[] = [snapshotId];
  for (const s of signals) {
    params.push(s.sourceKey, s.category, s.changeType, s.severity, JSON.stringify(s.payload));
  }

  await client.query(
    `INSERT INTO signals
       (snapshot_id, source_key, category, change_type, severity, payload)
     VALUES ${values}`,
    params,
  );
}

/** Read back stored signals — used to score from DB (not from LLM output). */
export async function getSignalsForSnapshot(
  client: import("pg").PoolClient,
  snapshotId: string,
): Promise<StoredSignal[]> {
  const result = await client.query<SignalRow>(
    `SELECT id, snapshot_id, source_key, category, change_type, severity, payload
     FROM signals WHERE snapshot_id = $1`,
    [snapshotId],
  );
  return result.rows.map(rowToSignal);
}
