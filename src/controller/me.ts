import { Request, Response } from "express";
import { getCompanyById } from "../service/userService";

export async function me(req: Request, res: Response): Promise<void> {
  const { companyId, email, role } = req.user!;
  const company = await getCompanyById(companyId);

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.status(200).json({
    email,
    role,
    company: {
      id: company.id,
      name: company.name,
    },
  });
}
