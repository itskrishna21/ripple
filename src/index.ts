import "dotenv/config";
import express, { Request, Response } from "express";
import {
  getAnalysisByCompetitorId,
  getAnalysisOfAllCompetitors,
} from "./controller/analysis";
import { signin } from "./controller/auth/signin";
import { signup } from "./controller/auth/signup";
import {
  createCompetitor,
  deleteCompetitor,
  getCompetitors,
  updateCompetitor,
} from "./controller/competitor";
import { runMigrations } from "./lib/migrate";
import { requireAuth } from "./middleware/auth";

const app = express();

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

app.post("/auth/signup", signup);
app.post("/auth/signin", signin);

app.get("/competitors", requireAuth, getCompetitors);
app.post("/competitors", requireAuth, createCompetitor);
app.patch("/competitors/:id", requireAuth, updateCompetitor);
app.delete("/competitors/:id", requireAuth, deleteCompetitor);

app.get("/analysis", requireAuth, getAnalysisOfAllCompetitors);
app.get("/competitors/:id/analysis", requireAuth, getAnalysisByCompetitorId);

async function start(): Promise<void> {
  await runMigrations();

  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
