import "server-only";
import { createHash } from "node:crypto";

type Attempt = { count: number; resetAt: number };
const state = globalThis as typeof globalThis & {
  alumniRecoveryAttempts?: Map<string, Attempt>;
};
const attempts = state.alumniRecoveryAttempts ?? new Map<string, Attempt>();
state.alumniRecoveryAttempts = attempts;

export function consumeRecoveryAttempt(client: string, now = Date.now()) {
  for (const [key, entry] of attempts)
    if (entry.resetAt <= now) attempts.delete(key);

  const key = createHash("sha256").update(client).digest("hex");
  const entry = attempts.get(key);
  if (entry) {
    if (entry.count >= 3) return false;
    entry.count += 1;
    return true;
  }
  // Fail closed when the bounded instance-local store is full.
  if (attempts.size >= 5000) return false;
  attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  return true;
}
