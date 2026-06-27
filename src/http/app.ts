import express, { Request, Response } from "express";
import {
  getAnalysisByCompetitorId,
  getAnalysisOfAllCompetitors,
} from "../controller/analysis";
import { signin } from "../controller/auth/signin";
import { signup } from "../controller/auth/signup";
import {
  createCompetitor,
  deleteCompetitor,
  getCompetitors,
  updateCompetitor,
  validateCreate,
  validateUpdate,
} from "../controller/competitor";
import { requireAuth } from "../middleware/auth";
import { signupSchema } from "../schema/signup";
import { signinSchema } from "../schema/signin";
import { asyncHandler } from "./asyncHandler";
import { errorMiddleware } from "./errorMiddleware";
import { validate } from "./validate";
import { pool } from "../lib/db";

export function buildApp() {
  const app = express();

  app.use(express.json());

  // Health: process is up
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // Ready: DB is reachable
  app.get("/ready", asyncHandler(async (_req: Request, res: Response) => {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  }));

  app.post("/auth/signup", validate(signupSchema), asyncHandler(signup));
  app.post("/auth/signin", validate(signinSchema), asyncHandler(signin));

  app.get("/competitors", requireAuth, asyncHandler(getCompetitors));
  app.post("/competitors", requireAuth, validateCreate, asyncHandler(createCompetitor));
  app.patch("/competitors/:id", requireAuth, validateUpdate, asyncHandler(updateCompetitor));
  app.delete("/competitors/:id", requireAuth, asyncHandler(deleteCompetitor));

  app.get("/analysis", requireAuth, asyncHandler(getAnalysisOfAllCompetitors));
  app.get("/competitors/:id/analysis", requireAuth, asyncHandler(getAnalysisByCompetitorId));

  app.use(errorMiddleware);

  return app;
}
