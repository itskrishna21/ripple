import { Request, Response } from "express";
import { getCompetitorById } from "../service/competitorService";
import {
  getLatestAnalysisForCompetitor,
  getLatestAnalysisForAllCompetitors,
} from "../service/analysisService";
import { CompetitorNotFoundError } from "../http/errors";

export async function getAnalysisByCompetitorId(
  req: Request,
  res: Response,
): Promise<void> {
  const { companyId } = req.user!;
  const id = req.params["id"] as string;

  // 404 if competitor doesn't belong to this company (tenant boundary)
  const competitor = await getCompetitorById(id, companyId);
  if (!competitor) throw new CompetitorNotFoundError();

  const analysis = await getLatestAnalysisForCompetitor(id, companyId);

  if (!analysis) {
    res.status(200).json({ competitorId: id, analysis: null });
    return;
  }

  res.status(200).json(analysis);
}

export async function getAnalysisOfAllCompetitors(
  req: Request,
  res: Response,
): Promise<void> {
  const { companyId } = req.user!;
  const analyses = await getLatestAnalysisForAllCompetitors(companyId);
  res.status(200).json(analyses);
}
