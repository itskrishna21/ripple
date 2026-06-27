import { createHash } from "crypto";

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
