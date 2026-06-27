import { Request, Response } from "express";
import {
  getAnalysisByCompetitorId as fetchAnalysisByCompetitorId,
  getAnalysisForAllCompetitors,
} from "../service/analysisService";
import { getCompetitorById } from "../service/competitorService";
import { CompetitorNotFoundError } from "../http/errors";

export async function getAnalysisByCompetitorId(
  req: Request,
  res: Response,
): Promise<void> {
  const { companyId } = req.user!;
  const id = req.params["id"] as string;

  const competitor = await getCompetitorById(id, companyId);
  if (!competitor) throw new CompetitorNotFoundError();

  const analysis = await fetchAnalysisByCompetitorId(id);
  res.status(200).json(analysis);
}

export async function getAnalysisOfAllCompetitors(
  req: Request,
  res: Response,
): Promise<void> {
  const { companyId } = req.user!;
  const analysis = await getAnalysisForAllCompetitors(companyId);
  res.status(200).json(analysis);
}
