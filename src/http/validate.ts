import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { ValidationError } from "./errors";

type RequestField = "body" | "params" | "query";

/**
 * Parses and replaces req[field] with the validated, typed data.
 * Throws ValidationError (→ 400 via errorMiddleware) on failure.
 */
export function validate(schema: ZodType, field: RequestField = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[field]);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[field] = result.data;
    next();
  };
}
