import { Request, Response } from "express";
import { signInWithEmailPassword } from "../../lib/auth";
import { signinSchema } from "../../schema/signin";

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

  res.status(200).json(result);
}
