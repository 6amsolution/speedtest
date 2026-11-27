import "server-only";

/**
 * Shared response headers for the speed-test API.
 *
 * - `no-store, no-transform` stops browsers, CDNs and proxies from caching
 *   or compressing payloads (compression would inflate measured speed).
 * - CORS is opt-in via `SPEEDTEST_CORS_ORIGIN` (e.g. "*" or an origin), so
 *   other deployments can use this instance as a remote test server.
 */
export function speedTestHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store, no-cache, no-transform, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Timing-Allow-Origin": "*",
    ...extra,
  });

  const region = process.env.SPEEDTEST_ORIGIN_REGION || process.env.VERCEL_REGION;
  if (region) headers.set("x-speedtest-region", region.slice(0, 40));

  const cors = process.env.SPEEDTEST_CORS_ORIGIN;
  if (cors) {
    headers.set("Access-Control-Allow-Origin", cors);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Expose-Headers", "x-speedtest-region, Retry-After");
    headers.set("Access-Control-Max-Age", "86400");
    if (cors !== "*") headers.append("Vary", "Origin");
  }
  return headers;
}

export function jsonError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: speedTestHeaders({ "Content-Type": "application/json", ...extra }),
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: speedTestHeaders() });
}
