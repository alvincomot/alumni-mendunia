import "server-only";
import { createHash } from "node:crypto";

type Attempt = { count: number; resetAt: number };
export type RecoveryAttempt =
  | { allowed: true }
  | { allowed: false; retryAfter: number };
const state = globalThis as typeof globalThis & {
  alumniRecoveryAttempts?: Map<string, Attempt>;
};
const attempts = state.alumniRecoveryAttempts ?? new Map<string, Attempt>();
state.alumniRecoveryAttempts = attempts;

function secondsUntil(timestamp: number, now: number) {
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}

export function consumeRecoveryAttempt(
  client: string,
  now = Date.now(),
): RecoveryAttempt {
  for (const [key, entry] of attempts)
    if (entry.resetAt <= now) attempts.delete(key);

  const key = createHash("sha256").update(client).digest("hex");
  const entry = attempts.get(key);
  if (entry) {
    if (entry.count >= 3)
      return {
        allowed: false,
        retryAfter: secondsUntil(entry.resetAt, now),
      };
    entry.count += 1;
    return { allowed: true };
  }
  // Fail closed when the bounded instance-local store is full.
  if (attempts.size >= 5000)
    return { allowed: false, retryAfter: 15 * 60 };
  attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  return { allowed: true };
}
