import { Request, Response } from "express";
import {
  createCompetitorSchema,
  updateCompetitorSchema,
} from "../schema/competitor";
import {
  CompetitorNotFoundError,
  createCompetitor as createCompetitorRecord,
  deleteCompetitor as deleteCompetitorRecord,
  getCompetitors as listCompetitors,
  updateCompetitor as updateCompetitorRecord,
} from "../service/competitorService";

function getCompanyId(req: Request, res: Response): string | null {
  const companyId = req.user?.companyId;

  if (!companyId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return companyId;
}

export async function getCompetitors(req: Request, res: Response): Promise<void> {
  const companyId = getCompanyId(req, res);
  if (!companyId) {
    return;
  }

  const competitors = await listCompetitors(companyId);

  res.status(200).json(competitors);
}

export async function createCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = getCompanyId(req, res);
  if (!companyId) {
    return;
  }

  const parsed = createCompetitorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
    return;
  }

  const competitor = await createCompetitorRecord(companyId, parsed.data);

  res.status(201).json(competitor);
}

export async function updateCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = getCompanyId(req, res);
  if (!companyId) {
    return;
  }

  const parsed = updateCompetitorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
    return;
  }

  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Competitor id is required" });
    return;
  }

  try {
    const competitor = await updateCompetitorRecord(id, companyId, parsed.data);

    res.status(200).json(competitor);
  } catch (error) {
    if (error instanceof CompetitorNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    throw error;
  }
}

export async function deleteCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = getCompanyId(req, res);
  if (!companyId) {
    return;
  }

  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Competitor id is required" });
    return;
  }

  try {
    const competitor = await deleteCompetitorRecord(id, companyId);

    res.status(200).json(competitor);
  } catch (error) {
    if (error instanceof CompetitorNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    throw error;
  }
}
