import { Request, Response } from "express";
import { toPublicUser, signup as createAccount } from "../../service/userService";
import { signupSchema } from "../../schema/signup";

export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = signupSchema.parse(req.body); // validate middleware ran first
  const { user, company } = await createAccount(parsed);
  res.status(201).json({ user: toPublicUser(user), company });
}

