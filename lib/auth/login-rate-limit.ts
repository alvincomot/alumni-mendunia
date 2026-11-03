import "server-only";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_CLIENTS = 5_000;

type Attempt = { count: number; resetAt: number };

const globalRateLimit = globalThis as typeof globalThis & {
  alumniLoginAttempts?: Map<string, Attempt>;
};

const attempts =
  globalRateLimit.alumniLoginAttempts ?? new Map<string, Attempt>();
globalRateLimit.alumniLoginAttempts = attempts;

function pruneExpired(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
  if (attempts.size >= MAX_TRACKED_CLIENTS) {
    const oldest = [...attempts.entries()].sort(
      (left, right) => left[1].resetAt - right[1].resetAt,
    );
    for (const [key] of oldest.slice(0, attempts.size - MAX_TRACKED_CLIENTS + 1))
      attempts.delete(key);
  }
}

export function consumeLoginAttempt(clientKey: string, now = Date.now()) {
  pruneExpired(now);
  const current = attempts.get(clientKey);
  if (!current || current.resetAt <= now) {
    attempts.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function clearLoginAttempts(clientKey: string) {
  attempts.delete(clientKey);
}
