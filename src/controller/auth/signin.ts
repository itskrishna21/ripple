import { Request, Response } from "express";
import { signInWithEmailPassword } from "../../lib/auth";
import { signinSchema } from "../../schema/signin";
import {
  getCompanyById,
  getUserByFirebaseUid,
  toPublicUser,
} from "../../service/userService";

export async function signin(req: Request, res: Response): Promise<void> {
  const parsed = signinSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
    return;
  }

  const result = await signInWithEmailPassword(
    parsed.data.email,
    parsed.data.password,
  );

  if (!result) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = await getUserByFirebaseUid(result.firebaseUid);

  if (!user) {
    res.status(401).json({ error: "User not registered" });
    return;
  }

  const company = await getCompanyById(user.companyId);

  if (!company) {
    res.status(500).json({ error: "Company not found" });
    return;
  }

  res.status(200).json({
    token: result.token,
    user: toPublicUser(user),
    company,
  });
}
