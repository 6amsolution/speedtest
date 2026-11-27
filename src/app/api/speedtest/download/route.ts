import { randomBytes } from "node:crypto";
import { LIMITS } from "@/lib/servers";
import { consume, POLICIES } from "@/lib/rate-limit";
import { jsonError, preflight, speedTestHeaders } from "@/lib/http";

/**
 * Download endpoint: streams exactly `?bytes=N` bytes of incompressible data.
 *
 * A 1 MiB random block is generated once per process and streamed in 64 KiB
 * slices, so serving a test costs almost no CPU. Combined with
 * `Cache-Control: no-transform`, proxies cannot shrink the payload.
 */

const BLOCK_SIZE = 1024 * 1024;
const SLICE_SIZE = 256 * 1024;
let block: Buffer | null = null;

function randomBlock(): Buffer {
  block ??= randomBytes(BLOCK_SIZE);
  return block;
}

function parseBytes(value: string | null): number | null {
  if (value === null || !/^\d{1,10}$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= LIMITS.maxDownloadBytes ? bytes : null;
}

export function GET(request: Request): Response {
  const bytes = parseBytes(new URL(request.url).searchParams.get("bytes"));
  if (bytes === null) {
    return jsonError(400, `"bytes" must be an integer between 0 and ${LIMITS.maxDownloadBytes}`);
  }

  const decision = consume(request, POLICIES.download, bytes);
  if (!decision.allowed) {
    return jsonError(429, "Download rate limit exceeded", { "Retry-After": String(decision.retryAfterSeconds) });
  }

  const source = randomBlock();
  let sent = 0;
  let offset = 0;

  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (sent >= bytes) {
          controller.close();
          return;
        }
        const size = Math.min(SLICE_SIZE, bytes - sent, BLOCK_SIZE - offset);
        // Copy so the shared block can't be mutated/transferred downstream.
        controller.enqueue(new Uint8Array(source.subarray(offset, offset + size)));
        sent += size;
        offset = (offset + size) % BLOCK_SIZE;
      },
    },
    { highWaterMark: 4 },
  );

  return new Response(stream, {
    status: 200,
    headers: speedTestHeaders({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Content-Encoding": "identity",
    }),
  });
}

export function OPTIONS(): Response {
  return preflight();
}
