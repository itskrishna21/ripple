import { getCompetitors } from "./competitorService";

export type Analysis = {
  competitorId: string;
  summary: string;
};

export async function getAnalysisByCompetitorId(
  competitorId: string,
): Promise<Analysis> {
  return {
    competitorId,
    summary: "Analysis not yet implemented",
  };
}

export async function getAnalysisForAllCompetitors(
  companyId: string,
): Promise<Analysis[]> {
  const competitors = await getCompetitors(companyId);

  return Promise.all(
    competitors.map((competitor) =>
      getAnalysisByCompetitorId(competitor.id),
    ),
  );
}
