import "server-only";

/**
 * Fixed-window, in-memory rate limiter keyed by client IP.
 *
 * Tracks both request count and bytes per window, so a single client can't
 * turn the test endpoints into a free bandwidth source.
 *
 * Note: state is per server instance. On multi-instance / serverless
 * deployments, put a shared limiter (e.g. Redis, or your platform's WAF
 * rate limiting) in front of these routes for strict guarantees.
 */

interface Bucket {
  windowStart: number;
  requests: number;
  bytes: number;
}

export interface RateLimitPolicy {
  name: string;
  windowMs: number;
  maxRequests: number;
  maxBytes: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingBytes: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs && buckets.size < MAX_TRACKED_KEYS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key);
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown";
  return ip.slice(0, 64);
}

/**
 * Registers one request of `bytes` size against the client's budget.
 * Returns whether it is allowed.
 */
export function consume(request: Request, policy: RateLimitPolicy, bytes: number): RateLimitDecision {
  const now = Date.now();
  sweep(now, policy.windowMs);

  const key = `${policy.name}:${clientKey(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= policy.windowMs) {
    bucket = { windowStart: now, requests: 0, bytes: 0 };
    buckets.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + policy.windowMs - now) / 1000));
  if (bucket.requests + 1 > policy.maxRequests || bucket.bytes + bytes > policy.maxBytes) {
    return { allowed: false, retryAfterSeconds, remainingBytes: Math.max(0, policy.maxBytes - bucket.bytes) };
  }

  bucket.requests += 1;
  bucket.bytes += bytes;
  return { allowed: true, retryAfterSeconds, remainingBytes: policy.maxBytes - bucket.bytes };
}

/** Adds bytes discovered after the fact (e.g. streamed upload bodies). */
export function charge(request: Request, policy: RateLimitPolicy, bytes: number): void {
  const bucket = buckets.get(`${policy.name}:${clientKey(request)}`);
  if (bucket) bucket.bytes += bytes;
}

const MB = 1024 * 1024;

export const POLICIES = {
  ping: { name: "ping", windowMs: 60_000, maxRequests: 300, maxBytes: Number.POSITIVE_INFINITY },
  download: { name: "download", windowMs: 60_000, maxRequests: 200, maxBytes: 1500 * MB },
  upload: { name: "upload", windowMs: 60_000, maxRequests: 200, maxBytes: 600 * MB },
} satisfies Record<string, RateLimitPolicy>;
