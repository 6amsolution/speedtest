/**
 * A speed-test server definition. All URLs are real endpoints — either
 * relative (served by this Next.js app) or absolute (a CORS-enabled host).
 *
 * `downloadUrl` must contain the `{bytes}` placeholder, which is replaced by
 * the requested payload size for every download request.
 */
export interface SpeedTestServer {
  id: string;
  name: string;
  provider: string;
  /** Static city, if known. May be refined at runtime via `locationHeader`. */
  city?: string;
  /** Static country, if known. */
  country?: string;
  /** Small/empty response used for latency measurement. */
  pingUrl: string;
  /** Streaming download endpoint, with a `{bytes}` placeholder. */
  downloadUrl: string;
  /** Endpoint that accepts POSTed bodies and discards them. */
  uploadUrl: string;
  /** Largest payload the server accepts per download request. */
  maxDownloadBytes: number;
  /** Largest body the server accepts per upload request. */
  maxUploadBytes: number;
  /**
   * Optional response header (CORS-exposed) whose value describes where the
   * request was actually served from, e.g. Cloudflare's `cf-meta-colo`.
   */
  locationHeader?: string;
  /**
   * Which endpoint returns `locationHeader`: the ping URL (default) or a
   * tiny empty POST to the upload URL (Cloudflare only exposes it there).
   */
  locationFrom?: "ping" | "upload";
}

export type ProbeStatus = "probing" | "online" | "offline";

export interface ServerProbe {
  status: ProbeStatus;
  /** Best observed round-trip time, ms. */
  latencyMs: number | null;
  /** Location reported live by the server (via `locationHeader`). */
  liveLocation?: string;
  error?: string;
}

export type TestPhase =
  | "idle"
  | "ping"
  | "jitter"
  | "download"
  | "upload"
  | "complete"
  | "cancelled"
  | "error";

export type ActivePhase = Extract<TestPhase, "ping" | "jitter" | "download" | "upload">;

export interface LatencyResult {
  /** Average round-trip time, ms. */
  avg: number;
  min: number;
  max: number;
  /** Mean absolute difference between consecutive samples, ms. */
  jitter: number;
  samples: number[];
  /** Requests that timed out or failed. */
  lost: number;
}

export interface ThroughputResult {
  /** Final measured speed, megabits per second. */
  mbps: number;
  /** Total bytes actually transferred during the phase. */
  bytes: number;
  /** Wall time of the measurement window, ms. */
  durationMs: number;
}

export interface TestResults {
  latency: LatencyResult;
  download: ThroughputResult;
  upload: ThroughputResult;
  serverName: string;
  completedAt: number;
}

export interface LiveState {
  phase: TestPhase;
  /** 0..1 progress within the current phase. */
  phaseProgress: number;
  /** Most recent live throughput reading, Mbps. */
  liveMbps: number;
  /** Most recent latency sample, ms. */
  liveLatencyMs: number | null;
  latency: LatencyResult | null;
  download: ThroughputResult | null;
  upload: ThroughputResult | null;
}

export interface EngineCallbacks {
  onPhase: (phase: ActivePhase) => void;
  onProgress: (progress: number) => void;
  onLatencySample: (ms: number) => void;
  onLatency: (result: LatencyResult) => void;
  onThroughput: (mbps: number) => void;
  onDownload: (result: ThroughputResult) => void;
  onUpload: (result: ThroughputResult) => void;
}
