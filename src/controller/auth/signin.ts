import { Request, Response } from "express";
import { UnauthorizedError } from "../../http/errors";
import { signInWithEmailPassword } from "../../lib/auth";
import { signinSchema } from "../../schema/signin";
import { getCompanyById, getUserByFirebaseUid, toPublicUser } from "../../service/userService";

export async function signin(req: Request, res: Response): Promise<void> {
  const parsed = signinSchema.parse(req.body); // validate middleware ran first

  const result = await signInWithEmailPassword(parsed.email, parsed.password);
  if (!result) throw new UnauthorizedError("Invalid email or password");

  const user = await getUserByFirebaseUid(result.firebaseUid);
  if (!user) throw new UnauthorizedError("User not registered");

  const company = await getCompanyById(user.companyId);
  if (!company) throw new Error("Company record missing for registered user");

  res.status(200).json({ token: result.token, user: toPublicUser(user), company });
}
