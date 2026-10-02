import { Request, Response } from "express";
import { discoverCompetitors } from "../mastra/discover";
import { createCompetitor } from "../service/competitorService";
import { getCompanyById } from "../service/userService";
import { enqueueBaselineSnapshot } from "../queue/enqueueBaseline";
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
  const { competitors } = req.body as SubscribeInput;

  const created = [];
  for (const c of competitors) {
    const row = await createCompetitor(companyId, c);
    await enqueueBaselineSnapshot(row.id);
    created.push(row);
  }

  res.status(201).json({ competitors: created });
}
