import { describe, it, expect } from "vitest";
import {
  BlockedUrlError,
  CompetitorNotFoundError,
  NotFoundError,
  SnapshotNotFoundError,
  UnauthorizedError,
  UserExistsError,
  ValidationError,
} from "../http/errors";

describe("domain error classes", () => {
  it("NotFoundError has correct name and message", () => {
    const e = new NotFoundError("Widget");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NotFoundError");
    expect(e.message).toBe("Widget not found");
  });

  it("CompetitorNotFoundError is instanceof NotFoundError", () => {
    const e = new CompetitorNotFoundError();
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.name).toBe("CompetitorNotFoundError");
    expect(e.message).toBe("Competitor not found");
  });

  it("SnapshotNotFoundError is instanceof NotFoundError", () => {
    const e = new SnapshotNotFoundError();
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.message).toBe("Snapshot not found");
  });

  it("UserExistsError message", () => {
    expect(new UserExistsError().message).toBe("Email already registered");
  });

  it("UnauthorizedError has default message", () => {
    expect(new UnauthorizedError().message).toBe("Unauthorized");
  });

  it("UnauthorizedError accepts custom message", () => {
    expect(new UnauthorizedError("Token expired").message).toBe("Token expired");
  });

  it("BlockedUrlError embeds the reason", () => {
    const e = new BlockedUrlError("private-ip");
    expect(e.name).toBe("BlockedUrlError");
    expect(e.message).toContain("private-ip");
  });

  it("ValidationError stores issues array", () => {
    const issues = [{ path: ["email"], message: "Required" }];
    const e = new ValidationError(issues);
    expect(e.name).toBe("ValidationError");
    expect(e.issues).toBe(issues);
    expect(e.message).toBe("Invalid request");
  });
});
