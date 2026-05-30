import { NextFunction, Request, Response } from "express";
import { getFirebaseAuth } from "../lib/firebase";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);

    req.user = {
      id: decoded.uid,
      email: decoded.email ?? "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
