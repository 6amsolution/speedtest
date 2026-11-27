import { consume, POLICIES } from "@/lib/rate-limit";
import { jsonError, preflight, speedTestHeaders } from "@/lib/http";

/**
 * Latency endpoint: an empty, uncacheable response.
 * Reading request headers (for rate limiting) keeps this handler dynamic,
 * so it is never prerendered into a static file.
 */
export function GET(request: Request): Response {
  const decision = consume(request, POLICIES.ping, 0);
  if (!decision.allowed) {
    return jsonError(429, "Too many requests", { "Retry-After": String(decision.retryAfterSeconds) });
  }
  return new Response(null, { status: 200, headers: speedTestHeaders({ "Content-Length": "0" }) });
}

export function OPTIONS(): Response {
  return preflight();
}
