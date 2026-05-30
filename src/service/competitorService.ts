import {
  CreateCompetitorInput,
  UpdateCompetitorInput,
} from "../schema/competitor";
import { pool } from "../lib/db";

export type Competitor = {
  id: string;
  name: string;
  website?: string;
};

type CompetitorRow = {
  id: string;
  name: string;
  website: string | null;
};

export class CompetitorNotFoundError extends Error {
  constructor() {
    super("Competitor not found");
    this.name = "CompetitorNotFoundError";
  }
}

function rowToCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    name: row.name,
    ...(row.website ? { website: row.website } : {}),
  };
}

export async function getCompetitorById(id: string): Promise<Competitor | null> {
  const result = await pool.query<CompetitorRow>(
    "SELECT id, name, website FROM competitors WHERE id = $1",
    [id],
  );

  const row = result.rows[0];
  return row ? rowToCompetitor(row) : null;
}

export async function getCompetitors(): Promise<Competitor[]> {
  const result = await pool.query<CompetitorRow>(
    "SELECT id, name, website FROM competitors ORDER BY created_at DESC",
  );

  return result.rows.map(rowToCompetitor);
}

export async function createCompetitor(
  input: CreateCompetitorInput,
): Promise<Competitor> {
  const result = await pool.query<CompetitorRow>(
    `
      INSERT INTO competitors (name, website)
      VALUES ($1, $2)
      RETURNING id, name, website
    `,
    [input.name, input.website ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create competitor");
  }

  return rowToCompetitor(row);
}

export async function updateCompetitor(
  id: string,
  input: UpdateCompetitorInput,
): Promise<Competitor> {
  const existing = await getCompetitorById(id);

  if (!existing) {
    throw new CompetitorNotFoundError();
  }

  const name = input.name ?? existing.name;
  const website =
    input.website !== undefined ? input.website : existing.website;

  const result = await pool.query<CompetitorRow>(
    `
      UPDATE competitors
      SET name = $2, website = $3
      WHERE id = $1
      RETURNING id, name, website
    `,
    [id, name, website ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new CompetitorNotFoundError();
  }

  return rowToCompetitor(row);
}

export async function deleteCompetitor(id: string): Promise<Competitor> {
  const result = await pool.query<CompetitorRow>(
    `
      DELETE FROM competitors
      WHERE id = $1
      RETURNING id, name, website
    `,
    [id],
  );

  const row = result.rows[0];
  if (!row) {
    throw new CompetitorNotFoundError();
  }

  return rowToCompetitor(row);
}
