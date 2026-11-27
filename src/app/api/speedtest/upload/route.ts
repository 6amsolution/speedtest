import { LIMITS } from "@/lib/servers";
import { charge, consume, POLICIES } from "@/lib/rate-limit";
import { jsonError, preflight, speedTestHeaders } from "@/lib/http";

/**
 * Upload endpoint: reads the request body to completion, counts the bytes,
 * and discards them. Nothing is stored.
 *
 * - Bodies larger than `SPEEDTEST_MAX_UPLOAD_BYTES` (default 8 MiB) are
 *   rejected with 413, both up-front (Content-Length) and while streaming
 *   (for chunked bodies without a length).
 * - Requests and bytes are rate limited per client IP.
 */
export async function POST(request: Request): Promise<Response> {
  const max = LIMITS.maxUploadBytes;
  const declaredHeader = request.headers.get("content-length");
  const declared = declaredHeader !== null ? Number(declaredHeader) : null;

  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0)) {
    return jsonError(400, "Invalid Content-Length");
  }
  if (declared !== null && declared > max) {
    return jsonError(413, `Upload payload exceeds ${max} bytes`);
  }

  const decision = consume(request, POLICIES.upload, declared ?? 0);
  if (!decision.allowed) {
    return jsonError(429, "Upload rate limit exceeded", { "Retry-After": String(decision.retryAfterSeconds) });
  }

  const started = performance.now();
  let received = 0;

  if (request.body) {
    const reader = request.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > max) {
          await reader.cancel();
          return jsonError(413, `Upload payload exceeds ${max} bytes`);
        }
      }
    } catch {
      // Client aborted mid-upload (normal at the end of a timed test).
      return jsonError(499, "Upload aborted by client");
    } finally {
      reader.releaseLock();
    }
  }

  // Bill streamed bodies that had no Content-Length up front.
  if (declared === null) charge(request, POLICIES.upload, received);

  return new Response(
    JSON.stringify({ received, durationMs: Math.round(performance.now() - started) }),
    { status: 200, headers: speedTestHeaders({ "Content-Type": "application/json" }) },
  );
}

export function OPTIONS(): Response {
  return preflight();
}
