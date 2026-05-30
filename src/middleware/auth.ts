import { NextFunction, Request, Response } from "express";
import { getFirebaseAuth } from "../lib/firebase";
import { getUserByFirebaseUid } from "../service/userService";

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
    const user = await getUserByFirebaseUid(decoded.uid);

    if (!user) {
      res.status(401).json({ error: "User not registered" });
      return;
    }

    req.user = {
      id: decoded.uid,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
