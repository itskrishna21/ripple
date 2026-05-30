import { Request, Response } from "express";
import {
  getAnalysisByCompetitorId as fetchAnalysisByCompetitorId,
  getAnalysisForAllCompetitors,
} from "../service/analysisService";
import { getCompetitorById } from "../service/competitorService";

export async function getAnalysisByCompetitorId(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = req.user?.companyId;

  if (!companyId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Competitor id is required" });
    return;
  }

  const competitor = await getCompetitorById(id, companyId);
  if (!competitor) {
    res.status(404).json({ error: "Competitor not found" });
    return;
  }

  const analysis = await fetchAnalysisByCompetitorId(id);

  res.status(200).json(analysis);
}

export async function getAnalysisOfAllCompetitors(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = req.user?.companyId;

  if (!companyId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const analysis = await getAnalysisForAllCompetitors(companyId);

  res.status(200).json(analysis);
}
