import "server-only";
import { createHash, randomUUID } from "node:crypto";

const windowMs = 15 * 60 * 1000;
const pendingMs = 5 * 60 * 1000;
const deliveredLimit = 3;
const failureLimit = 10;
const pendingLimit = 3;

type Attempt = {
  deliveredAt: number[];
  failedAt: number[];
  pending: Map<string, number>;
};

type SchoolMailRateLimitState = typeof globalThis & {
  alumniSchoolMailClientAttempts?: Map<string, Attempt>;
};

const state = globalThis as SchoolMailRateLimitState;
const attempts =
  state.alumniSchoolMailClientAttempts ?? new Map<string, Attempt>();
state.alumniSchoolMailClientAttempts = attempts;

function keyFor(client: string) {
  return createHash("sha256").update(client).digest("hex");
}

function secondsUntil(timestamp: number, now: number) {
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}

function prune(entry: Attempt, now: number) {
  const cutoff = now - windowMs;
  entry.deliveredAt = entry.deliveredAt.filter((value) => value > cutoff);
  entry.failedAt = entry.failedAt.filter((value) => value > cutoff);
  for (const [token, expiresAt] of entry.pending)
    if (expiresAt <= now) entry.pending.delete(token);
}

function removeEmpty(key: string, entry: Attempt) {
  if (!entry.pending.size && !entry.deliveredAt.length && !entry.failedAt.length)
    attempts.delete(key);
}

function activeLimit(entry: Attempt, now: number) {
  const deliveredUntil =
    entry.deliveredAt.length >= deliveredLimit
      ? entry.deliveredAt[0] + windowMs
      : 0;
  const failedUntil =
    entry.failedAt.length >= failureLimit ? entry.failedAt[0] + windowMs : 0;
  const blockedUntil = Math.max(deliveredUntil, failedUntil);
  return {
    retryAfter: blockedUntil > now ? secondsUntil(blockedUntil, now) : 0,
    reason:
      deliveredUntil >= failedUntil
        ? ("delivered" as const)
        : ("failed" as const),
  };
}

function retryAfterFor(entry: Attempt, now: number) {
  const activeRetryAfter = activeLimit(entry, now).retryAfter;
  const pendingRetryAfter =
    entry.pending.size >= pendingLimit
      ? secondsUntil(Math.min(...entry.pending.values()), now)
      : 0;
  return Math.max(activeRetryAfter, pendingRetryAfter);
}

export type SchoolMailAttempt =
  | { allowed: true; token: string }
  | {
      allowed: false;
      retryAfter: number;
      reason: "capacity" | "delivered" | "failed";
    };

export function getSchoolMailClientRetryAfter(
  client: string,
  now = Date.now(),
) {
  const key = keyFor(client);
  const entry = attempts.get(key);
  if (!entry) return 0;
  prune(entry, now);
  const retryAfter = retryAfterFor(entry, now);
  removeEmpty(key, entry);
  return retryAfter;
}

export function beginSchoolMailAttempt(
  client: string,
  now = Date.now(),
): SchoolMailAttempt {
  for (const [key, entry] of attempts) {
    prune(entry, now);
    removeEmpty(key, entry);
  }

  const key = keyFor(client);
  const entry =
    attempts.get(key) ??
    ({ deliveredAt: [], failedAt: [], pending: new Map() } satisfies Attempt);

  const limit = activeLimit(entry, now);
  if (limit.retryAfter)
    return {
      allowed: false,
      retryAfter: limit.retryAfter,
      reason: limit.reason,
    };

  if (entry.pending.size >= pendingLimit)
    return {
      allowed: false,
      retryAfter: secondsUntil(Math.min(...entry.pending.values()), now),
      reason: "capacity",
    };

  if (attempts.size >= 5000 && !attempts.has(key))
    return {
      allowed: false,
      retryAfter: Math.ceil(windowMs / 1000),
      reason: "failed",
    };

  const token = randomUUID();
  entry.pending.set(token, now + pendingMs);
  attempts.set(key, entry);
  return { allowed: true, token };
}

export function finishSchoolMailAttempt(
  client: string,
  token: string,
  outcome: "delivered" | "failed" | "released",
  now = Date.now(),
) {
  const key = keyFor(client);
  const entry = attempts.get(key);
  if (!entry || !entry.pending.has(token))
    return { settled: false, retryAfter: 0 };

  entry.pending.delete(token);
  prune(entry, now);
  if (outcome === "delivered") entry.deliveredAt.push(now);
  if (outcome === "failed") entry.failedAt.push(now);
  const retryAfter = activeLimit(entry, now).retryAfter;
  removeEmpty(key, entry);
  return { settled: true, retryAfter };
}
