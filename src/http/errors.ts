export class NotFoundError extends Error {
  constructor(entity = "Resource") {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class CompetitorNotFoundError extends NotFoundError {
  constructor() {
    super("Competitor");
    this.name = "CompetitorNotFoundError";
  }
}

export class SnapshotNotFoundError extends NotFoundError {
  constructor() {
    super("Snapshot");
    this.name = "SnapshotNotFoundError";
  }
}

export class UserExistsError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "UserExistsError";
  }
}

export class UnauthorizedError extends Error {
  constructor(msg = "Unauthorized") {
    super(msg);
    this.name = "UnauthorizedError";
  }
}

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(`URL is not allowed: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

export class ValidationError extends Error {
  readonly issues: readonly object[];
  constructor(issues: readonly object[]) {
    super("Invalid request");
    this.name = "ValidationError";
    this.issues = issues;
  }
}
