import { afterEach, describe, expect, it } from "vitest";
import { getBoss, stopBoss } from "../queue/boss";

describe("pg-boss lifecycle", () => {
  afterEach(async () => {
    await stopBoss();
  });

  it("getBoss() starts and returns a PgBoss instance", async () => {
    const boss = await getBoss();
    expect(boss).toBeDefined();
    // getQueues() resolves to an array when the boss is running.
    const queues = await boss.getQueues();
    expect(Array.isArray(queues)).toBe(true);
  });

  it("getBoss() returns the same singleton on repeated calls", async () => {
    const a = await getBoss();
    const b = await getBoss();
    expect(a).toBe(b);
  });

  it("stopBoss() stops cleanly and resets the singleton", async () => {
    await getBoss();
    await stopBoss();
    // After stopping, a fresh call to getBoss() should start a new instance.
    const fresh = await getBoss();
    expect(fresh).toBeDefined();
    const queues = await fresh.getQueues();
    expect(Array.isArray(queues)).toBe(true);
  });
});
