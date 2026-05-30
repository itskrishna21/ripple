import { Request, Response } from "express";
import { createUser, UserExistsError } from "../../lib/auth";
import { signupSchema } from "../../schema/signup";

export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const user = await createUser(parsed.data.email, parsed.data.password);

    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof UserExistsError) {
      res.status(409).json({ error: error.message });
      return;
    }

    throw error;
  }
}
