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

export async function getCompetitors(
  _req: Request,
  res: Response,
): Promise<void> {
  const competitors = await listCompetitors();

  res.status(200).json(competitors);
}

export async function createCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createCompetitorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
    return;
  }

  const competitor = await createCompetitorRecord(parsed.data);

  res.status(201).json(competitor);
}

export async function updateCompetitor(
  req: Request,
  res: Response,
): Promise<void> {
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
    const competitor = await updateCompetitorRecord(id, parsed.data);

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
  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Competitor id is required" });
    return;
  }

  try {
    const competitor = await deleteCompetitorRecord(id);

    res.status(200).json(competitor);
  } catch (error) {
    if (error instanceof CompetitorNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    throw error;
  }
}
