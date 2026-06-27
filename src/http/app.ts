import express, { Request, Response } from "express";
import cors from "cors";
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

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3001", credentials: true }));
  app.use(express.json());

  // Health: process is up (no DB check — load balancer uses this)
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  // Ready: DB reachable + queue depths + snapshot pipeline summary
  app.get("/ready", asyncHandler(async (_req: Request, res: Response) => {
    await pool.query("SELECT 1"); // throws if DB is down → 500

    // Queue depths from pg-boss schema
    const queues = await pool.query<{ name: string; count: string }>(
      `SELECT name, count(*) AS count
       FROM pgboss.job
       WHERE state = 'created'
       GROUP BY name`,
    );

    const queueDepths: Record<string, number> = {};
    for (const row of queues.rows) {
      queueDepths[row.name] = Number(row.count);
    }

    // Snapshot pipeline summary (last 24 h)
    const snapStats = await pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, count(*) AS count
       FROM competitor_snapshots
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY status`,
    );

    const snapshots24h: Record<string, number> = {};
    for (const row of snapStats.rows) {
      snapshots24h[row.status] = Number(row.count);
    }

    // Stuck snapshots count (in-flight past threshold)
    const stuck = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM competitor_snapshots
       WHERE status IN ('pending','fetching','analyzing')
         AND updated_at < NOW() - INTERVAL '30 minutes'`,
    );

    res.status(200).json({
      status: "ready",
      db: "ok",
      queueDepths,
      snapshots24h,
      stuckSnapshots: Number(stuck.rows[0]!.count),
    });
  }));

  // Metrics: counters for log-based aggregation + structured data
  app.get("/metrics", asyncHandler(async (_req: Request, res: Response) => {
    const [competitors, snapshots, analyses, signals, failed] =
      await Promise.all([
        pool.query<{ count: string }>("SELECT count(*) AS count FROM competitors"),
        pool.query<{ count: string }>("SELECT count(*) AS count FROM competitor_snapshots"),
        pool.query<{ count: string }>("SELECT count(*) AS count FROM analyses"),
        pool.query<{ count: string }>("SELECT count(*) AS count FROM signals"),
        pool.query<{ count: string }>(
          `SELECT count(*) AS count FROM pgboss.job WHERE state = 'failed'`,
        ),
      ]);

    const byStatus = await pool.query<{ status: string; count: string }>(
      `SELECT status, count(*) AS count
       FROM competitor_snapshots GROUP BY status`,
    );

    const snapshotsByStatus: Record<string, number> = {};
    for (const row of byStatus.rows) {
      snapshotsByStatus[row.status] = Number(row.count);
    }

    res.status(200).json({
      totals: {
        competitors: Number(competitors.rows[0]!.count),
        snapshots: Number(snapshots.rows[0]!.count),
        analyses: Number(analyses.rows[0]!.count),
        signals: Number(signals.rows[0]!.count),
        failedJobs: Number(failed.rows[0]!.count),
      },
      snapshotsByStatus,
      uptime: process.uptime(),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
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
