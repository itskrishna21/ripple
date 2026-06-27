import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";

// Mocks must be declared before any imports that transitively load firebase.
vi.mock("../lib/firebase", () => ({
  getFirebaseAdmin: vi.fn(),
  getFirebaseAuth: vi.fn(() => ({
    verifyIdToken: vi.fn().mockRejectedValue(new Error("no firebase in tests")),
    createUser: vi.fn().mockRejectedValue(new Error("no firebase in tests")),
  })),
}));

vi.mock("../lib/auth", () => ({
  signInWithEmailPassword: vi.fn().mockResolvedValue(null),
}));

import { buildApp } from "../http/app";
import { pool } from "../lib/db";

const app = buildApp();

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Health & ready
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns 200 ok with uptime — no DB required", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /ready", () => {
  it("returns 200 with queue depths and snapshot summary when DB is reachable", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", db: "ok" });
    expect(typeof res.body.stuckSnapshots).toBe("number");
    expect(res.body.queueDepths).toBeDefined();
    expect(res.body.snapshots24h).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Validation middleware (no Firebase involved)
// ---------------------------------------------------------------------------

describe("POST /auth/signup — validation", () => {
  it("400 with issues array when body is empty", async () => {
    const res = await request(app).post("/auth/signup").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it("400 when password is too short", async () => {
    const res = await request(app).post("/auth/signup").send({
      email: "test@example.com",
      password: "short",
      companyName: "Acme",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("400 when email is missing", async () => {
    const res = await request(app).post("/auth/signup").send({
      password: "password123",
      companyName: "Acme",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/signin — validation", () => {
  it("400 when email is missing", async () => {
    const res = await request(app).post("/auth/signin").send({ password: "pw" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("400 when password is missing", async () => {
    const res = await request(app).post("/auth/signin").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Auth middleware — no token
// ---------------------------------------------------------------------------

describe("Protected routes without token", () => {
  const protectedRoutes = [
    { method: "get", path: "/competitors" },
    { method: "post", path: "/competitors" },
    { method: "get", path: "/analysis" },
    { method: "get", path: "/competitors/some-id/analysis" },
  ] as const;

  for (const { method, path } of protectedRoutes) {
    it(`${method.toUpperCase()} ${path} → 401`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Auth middleware — invalid token
// ---------------------------------------------------------------------------

describe("Protected routes with bad token", () => {
  it("GET /competitors with invalid Bearer token → 401", async () => {
    const res = await request(app)
      .get("/competitors")
      .set("Authorization", "Bearer invalid.token.here");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Competitor CRUD — input validation (no auth bypass needed, validate runs before auth for POST)
// Actually requireAuth runs first, so these will 401. Test the shape of that.
// ---------------------------------------------------------------------------

describe("POST /competitors — body validation blocked by auth first", () => {
  it("401 when no auth (validate runs after requireAuth)", async () => {
    const res = await request(app)
      .post("/competitors")
      .send({ name: "" }); // invalid body, but auth fires first
    expect(res.status).toBe(401);
  });
});
