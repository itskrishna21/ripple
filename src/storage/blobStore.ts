import { pool } from "../lib/db";

export interface BlobStore {
  /** Persist raw HTML. Returns the storage key for later retrieval. */
  put(snapshotId: string, sourceKey: string, raw: string): Promise<string>;
  /** Retrieve raw HTML by storage key. */
  get(storageKey: string): Promise<string>;
}

/**
 * PgBlobStore — stores blobs in the `snapshot_blobs` table.
 *
 * Storage key: "{snapshotId}/{sourceKey}"
 * Upserts on conflict so re-runs don't fail.
 *
 * A later migration can swap this for an S3BlobStore behind the same interface.
 */
export class PgBlobStore implements BlobStore {
  async put(
    snapshotId: string,
    sourceKey: string,
    raw: string,
  ): Promise<string> {
    const storageKey = `${snapshotId}/${sourceKey}`;
    await pool.query(
      `INSERT INTO snapshot_blobs (storage_key, snapshot_id, source_key, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (storage_key) DO UPDATE SET content = EXCLUDED.content`,
      [storageKey, snapshotId, sourceKey, raw],
    );
    return storageKey;
  }

  async get(storageKey: string): Promise<string> {
    const result = await pool.query<{ content: string }>(
      `SELECT content FROM snapshot_blobs WHERE storage_key = $1`,
      [storageKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Blob not found: ${storageKey}`);
    return row.content;
  }
}

export const blobStore: BlobStore = new PgBlobStore();
