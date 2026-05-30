import {
  CreateCompetitorInput,
  UpdateCompetitorInput,
} from "../schema/competitor";
import { pool } from "../lib/db";

export type Competitor = {
  id: string;
  name: string;
  website?: string;
  pricingUrl?: string;
  changelogUrl?: string;
  careersUrl?: string;
  blogUrl?: string;
};

type CompetitorRow = {
  id: string;
  name: string;
  website: string | null;
  pricing_url: string | null;
  changelog_url: string | null;
  careers_url: string | null;
  blog_url: string | null;
};

const competitorColumns = `
  id,
  name,
  website,
  pricing_url,
  changelog_url,
  careers_url,
  blog_url
`;

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
    ...(row.pricing_url ? { pricingUrl: row.pricing_url } : {}),
    ...(row.changelog_url ? { changelogUrl: row.changelog_url } : {}),
    ...(row.careers_url ? { careersUrl: row.careers_url } : {}),
    ...(row.blog_url ? { blogUrl: row.blog_url } : {}),
  };
}

export async function getCompetitorById(
  id: string,
  companyId: string,
): Promise<Competitor | null> {
  const result = await pool.query<CompetitorRow>(
    `
      SELECT ${competitorColumns}
      FROM competitors
      WHERE id = $1 AND company_id = $2
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  return row ? rowToCompetitor(row) : null;
}

export async function getCompetitors(companyId: string): Promise<Competitor[]> {
  const result = await pool.query<CompetitorRow>(
    `
      SELECT ${competitorColumns}
      FROM competitors
      WHERE company_id = $1
      ORDER BY created_at DESC
    `,
    [companyId],
  );

  return result.rows.map(rowToCompetitor);
}

export async function createCompetitor(
  companyId: string,
  input: CreateCompetitorInput,
): Promise<Competitor> {
  const result = await pool.query<CompetitorRow>(
    `
      INSERT INTO competitors (
        company_id,
        name,
        website,
        pricing_url,
        changelog_url,
        careers_url,
        blog_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${competitorColumns}
    `,
    [
      companyId,
      input.name,
      input.website ?? null,
      input.pricingUrl ?? null,
      input.changelogUrl ?? null,
      input.careersUrl ?? null,
      input.blogUrl ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create competitor");
  }

  return rowToCompetitor(row);
}

export async function updateCompetitor(
  id: string,
  companyId: string,
  input: UpdateCompetitorInput,
): Promise<Competitor> {
  const existing = await getCompetitorById(id, companyId);

  if (!existing) {
    throw new CompetitorNotFoundError();
  }

  const result = await pool.query<CompetitorRow>(
    `
      UPDATE competitors
      SET
        name = $3,
        website = $4,
        pricing_url = $5,
        changelog_url = $6,
        careers_url = $7,
        blog_url = $8
      WHERE id = $1 AND company_id = $2
      RETURNING ${competitorColumns}
    `,
    [
      id,
      companyId,
      input.name ?? existing.name,
      input.website !== undefined ? input.website : existing.website ?? null,
      input.pricingUrl ?? existing.pricingUrl ?? null,
      input.changelogUrl ?? existing.changelogUrl ?? null,
      input.careersUrl ?? existing.careersUrl ?? null,
      input.blogUrl ?? existing.blogUrl ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new CompetitorNotFoundError();
  }

  return rowToCompetitor(row);
}

export async function deleteCompetitor(
  id: string,
  companyId: string,
): Promise<Competitor> {
  const result = await pool.query<CompetitorRow>(
    `
      DELETE FROM competitors
      WHERE id = $1 AND company_id = $2
      RETURNING ${competitorColumns}
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new CompetitorNotFoundError();
  }

  return rowToCompetitor(row);
}
