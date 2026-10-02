import { Request, Response } from "express";
import { discoverCompetitors } from "../mastra/discover";
import { createCompetitor } from "../service/competitorService";
import { getCompanyById, setCompanyCadence } from "../service/userService";
import type { DiscoverInput, SubscribeInput } from "../schema/discover";

export async function discover(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const { companyName: override } = req.body as DiscoverInput;

  const company = await getCompanyById(companyId);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const companyName = override ?? company.name;
  const result = await discoverCompetitors(companyName);
  res.status(200).json(result);
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const { companyId } = req.user!;
  const { cadence, competitors } = req.body as SubscribeInput;

  await setCompanyCadence(companyId, cadence);

  const created = [];
  for (const c of competitors) {
    created.push(await createCompetitor(companyId, c));
  }

  res.status(201).json({ cadence, competitors: created });
}
