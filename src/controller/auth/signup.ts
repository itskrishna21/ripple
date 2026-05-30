import { Request, Response } from "express";
import { signup as createAccount, UserExistsError, toPublicUser } from "../../service/userService";
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
    const { user, company } = await createAccount(parsed.data);

    res.status(201).json({
      user: toPublicUser(user),
      company,
    });
  } catch (error) {
    if (error instanceof UserExistsError) {
      res.status(409).json({ error: error.message });
      return;
    }

    throw error;
  }
}
