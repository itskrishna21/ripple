import { Request, Response } from "express";
import {
  createCompetitorSchema,
  updateCompetitorSchema,
} from "../schema/competitor";
import {
  createCompetitor as createCompetitorRecord,
  deleteCompetitor as deleteCompetitorRecord,
  getCompetitors as listCompetitors,
  updateCompetitor as updateCompetitorRecord,
} from "../service/competitorService";
import { validate } from "../http/validate";

// Re-export validate-wrapped schemas for use in app.ts route registration.
export const validateCreate = validate(createCompetitorSchema);
export const validateUpdate = validate(updateCompetitorSchema);

export async function getCompetitors(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const competitors = await listCompetitors(companyId);
  res.status(200).json(competitors);
}

export async function createCompetitor(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const competitor = await createCompetitorRecord(companyId, req.body);
  res.status(201).json(competitor);
}

export async function updateCompetitor(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const id = req.params["id"] as string;
  const competitor = await updateCompetitorRecord(id, companyId, req.body);
  res.status(200).json(competitor);
}

export async function deleteCompetitor(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const id = req.params["id"] as string;
  const competitor = await deleteCompetitorRecord(id, companyId);
  res.status(200).json(competitor);
}
