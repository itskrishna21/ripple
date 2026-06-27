import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  BlockedUrlError,
  CompetitorNotFoundError,
  NotFoundError,
  SnapshotNotFoundError,
  UnauthorizedError,
  UserExistsError,
  ValidationError,
} from "./errors";

function statusFor(err: unknown): number {
  if (err instanceof ValidationError) return 400;
  if (err instanceof BlockedUrlError) return 400;
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof UserExistsError) return 409;
  if (err instanceof CompetitorNotFoundError) return 404;
  if (err instanceof SnapshotNotFoundError) return 404;
  if (err instanceof NotFoundError) return 404;
  return 500;
}

// Express error middleware must have exactly 4 parameters.
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = statusFor(err);

  if (status === 500) {
    logger.error(
      { err, reqId: (req as { id?: string }).id, method: req.method, url: req.url },
      "unhandled error",
    );
  }

  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message, issues: err.issues });
    return;
  }

  const message =
    err instanceof Error && status < 500 ? err.message : "Internal server error";

  res.status(status).json({ error: message });
}
