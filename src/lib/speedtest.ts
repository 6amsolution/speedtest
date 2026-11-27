/**
 * Browser-side speed-test engine.
 *
 * Every number this module reports comes from real network transfers:
 *  - latency: timed HTTP round trips (Resource Timing when available),
 *  - download: bytes actually read off streamed response bodies,
 *  - upload: bytes the browser reports as sent via XHR upload progress.
 *
 * Nothing is simulated. If a measurement cannot be made, an error is thrown.
 */
import {
  latencyStats,
  steadyStateMbps,
  windowedMbps,
  type ByteSample,
} from "./calculations";
import { bustCache, isAbortError, linkedController } from "./utils";
import type {
  EngineCallbacks,
  LatencyResult,
  SpeedTestServer,
  TestResults,
  ThroughputResult,
} from "@/types/speedtest";

export class SpeedTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeedTestError";
  }
}

/** Tunables. Kept conservative to avoid excessive bandwidth usage. */
export const ENGINE_CONFIG = {
  ping: { samples: 10, timeoutMs: 3000 },
  jitter: { samples: 10 },
  download: {
    durationMs: 10_000,
    warmupMs: 1_500,
    streams: 4,
    /** Hard cap on total bytes per phase (very fast links finish early). */
    maxTotalBytes: 300 * 1024 * 1024,
    /** Per-request sizes grow geometrically up to the server limit. */
    initialChunkBytes: 1024 * 1024,
    headerTimeoutMs: 8_000,
    stallTimeoutMs: 6_000,
  },
  upload: {
    durationMs: 8_000,
    warmupMs: 1_500,
    streams: 3,
    maxTotalBytes: 150 * 1024 * 1024,
    initialChunkBytes: 256 * 1024,
    requestTimeoutMs: 20_000,
  },
  sampleIntervalMs: 200,
  liveWindowMs: 1_000,
} as const;

/* ------------------------------------------------------------------ */
/* Latency                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolves a possibly-relative URL so it matches Resource Timing entry names.
 */
function absolute(url: string): string {
  return new URL(url, window.location.href).toString();
}

/** One timed round trip. Prefers Resource Timing (excludes JS overhead). */
async function timedRequest(
  url: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ ms: number; response: Response }> {
  const target = absolute(bustCache(url));
  const link = linkedController([signal], timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: link.signal,
      credentials: "omit",
      redirect: "follow",
    });
    // Drain the (tiny) body so the connection is reusable and timing complete.
    await response.arrayBuffer();
    const wall = performance.now() - started;
    if (!response.ok) {
      throw new SpeedTestError(`Server responded with HTTP ${response.status}`);
    }

    const entries = performance.getEntriesByName(target, "resource") as PerformanceResourceTiming[];
    const entry = entries[entries.length - 1];
    // requestStart/responseStart are 0 for cross-origin hosts without
    // Timing-Allow-Origin; fall back to wall time in that case.
    const precise =
      entry && entry.requestStart > 0 && entry.responseStart > entry.requestStart
        ? entry.responseStart - entry.requestStart
        : null;
    if (entries.length) performance.clearResourceTimings();
    return { ms: precise ?? wall, response };
  } finally {
    link.dispose();
  }
}

/**
 * Measures `count` round trips after one discarded warm-up request (which
 * pays for DNS, TCP and TLS setup).
 */
export async function measureLatency(
  server: SpeedTestServer,
  count: number,
  signal: AbortSignal,
  onSample?: (ms: number, index: number) => void,
  options: { warmup?: boolean; timeoutMs?: number } = {},
): Promise<{ samples: number[]; lost: number; response?: Response }> {
  const timeoutMs = options.timeoutMs ?? ENGINE_CONFIG.ping.timeoutMs;
  const samples: number[] = [];
  let lost = 0;
  let lastResponse: Response | undefined;

  if (options.warmup !== false) {
    try {
      lastResponse = (await timedRequest(server.pingUrl, signal, timeoutMs)).response;
    } catch (error) {
      if (signal.aborted) throw error;
      // A failed warm-up is counted like any other lost request.
      lost++;
    }
  }

  for (let i = 0; i < count; i++) {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    try {
      const { ms, response } = await timedRequest(server.pingUrl, signal, timeoutMs);
      samples.push(ms);
      lastResponse = response;
      onSample?.(ms, i);
    } catch (error) {
      if (signal.aborted) throw error;
      lost++;
    }
  }

  return { samples, lost, response: lastResponse };
}

/** Quick reachability + latency probe used by the server selector. */
export async function probeServer(
  server: SpeedTestServer,
  signal: AbortSignal,
): Promise<{ latencyMs: number; liveLocation?: string }> {
  const { samples, response } = await measureLatency(server, 3, signal, undefined, {
    timeoutMs: 3000,
  });
  if (samples.length === 0) {
    throw new SpeedTestError("No response from server");
  }
  const liveLocation =
    server.locationHeader && response ? response.headers.get(server.locationHeader) ?? undefined : undefined;
  return { latencyMs: Math.min(...samples), liveLocation };
}

/* ------------------------------------------------------------------ */
/* Throughput helpers                                                  */
/* ------------------------------------------------------------------ */

interface ThroughputMeter {
  add: (bytes: number) => void;
  total: () => number;
  elapsed: () => number;
  timeline: ByteSample[];
  stop: () => void;
}

/** Tracks cumulative bytes over time and emits live speed readings. */
function createMeter(onLive: (mbps: number, elapsedMs: number) => void): ThroughputMeter {
  const start = performance.now();
  let bytes = 0;
  const timeline: ByteSample[] = [{ t: 0, bytes: 0 }];
  const timer = setInterval(() => {
    const t = performance.now() - start;
    timeline.push({ t, bytes });
    onLive(windowedMbps(timeline, ENGINE_CONFIG.liveWindowMs), t);
  }, ENGINE_CONFIG.sampleIntervalMs);

  return {
    add: (n) => {
      bytes += n;
    },
    total: () => bytes,
    elapsed: () => performance.now() - start,
    timeline,
    stop: () => {
      clearInterval(timer);
      timeline.push({ t: performance.now() - start, bytes });
    },
  };
}

function nextChunkSize(current: number, max: number): number {
  return Math.min(max, current * 4);
}

function finalize(meter: ThroughputMeter, warmupMs: number): ThroughputResult {
  const last = meter.timeline[meter.timeline.length - 1];
  return {
    mbps: steadyStateMbps(meter.timeline, warmupMs),
    bytes: last.bytes,
    durationMs: last.t,
  };
}

function describeHttpError(status: number): string {
  if (status === 429) return "The test server is rate limiting requests. Please wait a minute and retry.";
  if (status === 413) return "The test server rejected the payload size.";
  return `The test server responded with HTTP ${status}.`;
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

export async function measureDownload(
  server: SpeedTestServer,
  signal: AbortSignal,
  onLive: (mbps: number, progress: number) => void,
): Promise<ThroughputResult> {
  const cfg = ENGINE_CONFIG.download;
  const phase = linkedController([signal]);
  const maxChunk = Math.max(64 * 1024, server.maxDownloadBytes);
  const failure: { error: Error | null } = { error: null };
  let lastByteAt = performance.now();

  const meter = createMeter((mbps, t) => {
    onLive(mbps, Math.min(1, t / cfg.durationMs));
    const done = t >= cfg.durationMs || meter.total() >= cfg.maxTotalBytes;
    const stalled = performance.now() - lastByteAt > cfg.stallTimeoutMs;
    if (stalled && !done) {
      failure.error = new SpeedTestError("Download stalled — the server stopped sending data.");
    }
    if (done || stalled) phase.controller.abort();
  });

  const worker = async () => {
    let chunk = Math.min(cfg.initialChunkBytes, maxChunk);
    while (!phase.signal.aborted) {
      const url = bustCache(server.downloadUrl.replace("{bytes}", String(chunk)));
      const request = linkedController([phase.signal], cfg.headerTimeoutMs);
      const response = await fetch(url, {
        cache: "no-store",
        signal: request.signal,
        credentials: "omit",
      });
      request.dispose(); // headers arrived; body reads are governed by the stall check
      if (!response.ok || !response.body) {
        throw new SpeedTestError(describeHttpError(response.status));
      }
      const reader = response.body.getReader();
      const onAbort = () => void reader.cancel().catch(() => undefined);
      phase.signal.addEventListener("abort", onAbort, { once: true });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          meter.add(value.byteLength);
          lastByteAt = performance.now();
        }
      } finally {
        phase.signal.removeEventListener("abort", onAbort);
      }
      chunk = nextChunkSize(chunk, maxChunk);
    }
  };

  const outcomes = await Promise.allSettled(Array.from({ length: cfg.streams }, worker));
  meter.stop();
  phase.dispose();

  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  if (failure.error) throw failure.error;

  const firstError = outcomes.find(
    (o): o is PromiseRejectedResult => o.status === "rejected" && !isAbortError(o.reason),
  );
  if (meter.total() === 0) {
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new SpeedTestError("Download failed — no data was received.");
  }
  return finalize(meter, cfg.warmupMs);
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

let payloadCache: Blob | null = null;

/**
 * Incompressible random payload, generated once per session.
 * `crypto.getRandomValues` is limited to 64 KiB per call.
 */
function getPayload(size: number): Blob {
  if (!payloadCache || payloadCache.size < size) {
    const buffer = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += 65536) {
      crypto.getRandomValues(buffer.subarray(offset, Math.min(offset + 65536, size)));
    }
    // text/plain keeps cross-origin uploads a CORS "simple request" (no preflight).
    payloadCache = new Blob([buffer], { type: "text/plain" });
  }
  return payloadCache.slice(0, size, "text/plain");
}

function uploadOnce(
  url: string,
  body: Blob,
  signal: AbortSignal,
  timeoutMs: number,
  onProgress: (deltaBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let reported = 0;
    const onAbort = () => xhr.abort();

    xhr.open("POST", bustCache(url), true);
    xhr.timeout = timeoutMs;
    xhr.withCredentials = false;
    xhr.upload.onprogress = (event) => {
      const delta = event.loaded - reported;
      if (delta > 0) {
        reported = event.loaded;
        onProgress(delta);
      }
    };
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        // Account for any bytes the final progress event did not report.
        if (body.size > reported) onProgress(body.size - reported);
        resolve();
      } else {
        reject(new SpeedTestError(describeHttpError(xhr.status)));
      }
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new SpeedTestError("Upload failed — the connection to the server was interrupted."));
    };
    xhr.ontimeout = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new SpeedTestError("Upload timed out."));
    };
    xhr.onabort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}

export async function measureUpload(
  server: SpeedTestServer,
  signal: AbortSignal,
  onLive: (mbps: number, progress: number) => void,
): Promise<ThroughputResult> {
  const cfg = ENGINE_CONFIG.upload;
  const phase = linkedController([signal]);
  const maxChunk = Math.max(64 * 1024, server.maxUploadBytes);
  const payload = getPayload(maxChunk);

  const meter = createMeter((mbps, t) => {
    onLive(mbps, Math.min(1, t / cfg.durationMs));
    if (t >= cfg.durationMs || meter.total() >= cfg.maxTotalBytes) phase.controller.abort();
  });

  const worker = async () => {
    let chunk = Math.min(cfg.initialChunkBytes, maxChunk);
    while (!phase.signal.aborted) {
      await uploadOnce(server.uploadUrl, payload.slice(0, chunk, "text/plain"), phase.signal, cfg.requestTimeoutMs, (delta) =>
        meter.add(delta),
      );
      chunk = nextChunkSize(chunk, maxChunk);
    }
  };

  const outcomes = await Promise.allSettled(Array.from({ length: cfg.streams }, worker));
  meter.stop();
  phase.dispose();

  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

  const firstError = outcomes.find(
    (o): o is PromiseRejectedResult => o.status === "rejected" && !isAbortError(o.reason),
  );
  // If every stream failed before the time budget elapsed, the result is unreliable.
  const allFailed = outcomes.every((o) => o.status === "rejected" && !isAbortError(o.reason));
  if (meter.total() === 0 || allFailed) {
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new SpeedTestError("Upload failed — no data could be sent.");
  }
  return finalize(meter, cfg.warmupMs);
}

/* ------------------------------------------------------------------ */
/* Full sequence                                                       */
/* ------------------------------------------------------------------ */

/** Runs Ping → Jitter → Download → Upload against one server. */
export async function runSpeedTest(
  server: SpeedTestServer,
  signal: AbortSignal,
  cb: EngineCallbacks,
): Promise<TestResults> {
  const { ping, jitter } = ENGINE_CONFIG;
  performance.clearResourceTimings();

  // 1. Ping — includes a discarded connection warm-up.
  cb.onPhase("ping");
  cb.onProgress(0);
  const pingRun = await measureLatency(server, ping.samples, signal, (ms, i) => {
    cb.onLatencySample(ms);
    cb.onProgress((i + 1) / ping.samples);
  });

  // 2. Jitter — more back-to-back samples on the warm connection.
  cb.onPhase("jitter");
  cb.onProgress(0);
  const jitterRun = await measureLatency(
    server,
    jitter.samples,
    signal,
    (ms, i) => {
      cb.onLatencySample(ms);
      cb.onProgress((i + 1) / jitter.samples);
    },
    { warmup: false },
  );

  const samples = [...pingRun.samples, ...jitterRun.samples];
  const lost = pingRun.lost + jitterRun.lost;
  if (samples.length < Math.ceil((ping.samples + jitter.samples) / 2)) {
    throw new SpeedTestError("Too many latency requests failed — the server may be unreachable.");
  }
  const stats = latencyStats(samples);
  const latency: LatencyResult = { ...stats, samples, lost };
  cb.onLatency(latency);

  // 3. Download
  cb.onPhase("download");
  cb.onProgress(0);
  const download = await measureDownload(server, signal, (mbps, progress) => {
    cb.onThroughput(mbps);
    cb.onProgress(progress);
  });
  cb.onDownload(download);

  // 4. Upload
  cb.onPhase("upload");
  cb.onProgress(0);
  cb.onThroughput(0);
  const upload = await measureUpload(server, signal, (mbps, progress) => {
    cb.onThroughput(mbps);
    cb.onProgress(progress);
  });
  cb.onUpload(upload);

  return {
    latency,
    download,
    upload,
    serverName: server.name,
    completedAt: Date.now(),
  };
}
