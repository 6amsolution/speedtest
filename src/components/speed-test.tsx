"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, LoaderCircle, Play, RotateCcw, Server, Square } from "lucide-react";
import { Speedometer, type GaugeTone } from "./speedometer";
import { ResultCards, type MetricValue } from "./result-cards";
import { describeLocation } from "./server-selector";
import type { ToastMessage } from "./toast";
import { runSpeedTest } from "@/lib/speedtest";
import { formatBytes, formatMbps, formatMs, jitter, mean } from "@/lib/calculations";
import { cn, isAbortError } from "@/lib/utils";
import type {
  ActivePhase,
  LatencyResult,
  ServerProbe,
  SpeedTestServer,
  TestPhase,
  TestResults,
  ThroughputResult,
} from "@/types/speedtest";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

interface State {
  phase: TestPhase;
  progress: number;
  liveMbps: number;
  samples: number[];
  latency: LatencyResult | null;
  download: ThroughputResult | null;
  upload: ThroughputResult | null;
  results: TestResults | null;
  error: string | null;
  /** The server the current/last run used (frozen at start). */
  testedServer: SpeedTestServer | null;
}

type Action =
  | { type: "start"; server: SpeedTestServer }
  | { type: "phase"; phase: ActivePhase }
  | { type: "progress"; progress: number }
  | { type: "sample"; ms: number }
  | { type: "latency"; result: LatencyResult }
  | { type: "throughput"; mbps: number }
  | { type: "download"; result: ThroughputResult }
  | { type: "upload"; result: ThroughputResult }
  | { type: "complete"; results: TestResults }
  | { type: "cancelled" }
  | { type: "error"; message: string };

const initialState: State = {
  phase: "idle",
  progress: 0,
  liveMbps: 0,
  samples: [],
  latency: null,
  download: null,
  upload: null,
  results: null,
  error: null,
  testedServer: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...initialState, phase: "ping", testedServer: action.server };
    case "phase":
      return { ...state, phase: action.phase, progress: 0, liveMbps: 0 };
    case "progress":
      return { ...state, progress: action.progress };
    case "sample":
      return { ...state, samples: [...state.samples, action.ms] };
    case "latency":
      return { ...state, latency: action.result };
    case "throughput":
      return { ...state, liveMbps: action.mbps };
    case "download":
      return { ...state, download: action.result, liveMbps: action.result.mbps };
    case "upload":
      return { ...state, upload: action.result, liveMbps: action.result.mbps };
    case "complete":
      return { ...state, phase: "complete", progress: 1, results: action.results };
    case "cancelled":
      return { ...state, phase: "cancelled", liveMbps: 0, progress: 0 };
    case "error":
      return { ...state, phase: "error", liveMbps: 0, progress: 0, error: action.message };
  }
}

const RUNNING: readonly TestPhase[] = ["ping", "jitter", "download", "upload"];
const STEPS: { key: ActivePhase | "complete"; label: string }[] = [
  { key: "ping", label: "Ping" },
  { key: "jitter", label: "Jitter" },
  { key: "download", label: "Download" },
  { key: "upload", label: "Upload" },
  { key: "complete", label: "Results" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface SpeedTestProps {
  server: SpeedTestServer | null;
  probes: Record<string, ServerProbe>;
  /** True while servers are still being probed and none is selected yet. */
  locating: boolean;
  onRunningChange: (running: boolean) => void;
  onOpenServers: () => void;
  notify: (toast: Omit<ToastMessage, "id">) => void;
}

export function SpeedTest({ server, probes, locating, onRunningChange, onOpenServers, notify }: SpeedTestProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const running = RUNNING.includes(state.phase);

  // Abort any in-flight test on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async () => {
    if (!server || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    // Drop callbacks from a previous, already-aborted run.
    const guard = (action: Action) => {
      if (runIdRef.current === runId) dispatch(action);
    };

    guard({ type: "start", server });
    onRunningChange(true);
    try {
      const results = await runSpeedTest(server, controller.signal, {
        onPhase: (phase) => guard({ type: "phase", phase }),
        onProgress: (progress) => guard({ type: "progress", progress }),
        onLatencySample: (ms) => guard({ type: "sample", ms }),
        onLatency: (result) => guard({ type: "latency", result }),
        onThroughput: (mbps) => guard({ type: "throughput", mbps }),
        onDownload: (result) => guard({ type: "download", result }),
        onUpload: (result) => guard({ type: "upload", result }),
      });
      guard({ type: "complete", results });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        guard({ type: "cancelled" });
        notify({ kind: "info", title: "Test stopped", description: "Completed phases keep their measured values." });
      } else {
        const message = error instanceof Error ? error.message : "The test failed unexpectedly.";
        guard({ type: "error", message });
        notify({ kind: "error", title: "Speed test failed", description: message });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      onRunningChange(false);
    }
  }, [server, onRunningChange, notify]);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const copyResults = useCallback(async () => {
    const r = state.results;
    if (!r) return;
    const text = [
      `PULSETEST results — ${new Date(r.completedAt).toLocaleString()}`,
      `Server:   ${r.serverName}`,
      `Download: ${formatMbps(r.download.mbps)} Mbps`,
      `Upload:   ${formatMbps(r.upload.mbps)} Mbps`,
      `Ping:     ${formatMs(r.latency.avg)} ms (min ${formatMs(r.latency.min)} / max ${formatMs(r.latency.max)})`,
      `Jitter:   ${formatMs(r.latency.jitter)} ms`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify({ kind: "success", title: "Results copied to clipboard" });
    } catch {
      notify({ kind: "error", title: "Couldn't copy results", description: "Clipboard access was blocked by the browser." });
    }
  }, [state.results, notify]);

  /* Derived view data ------------------------------------------------ */

  const { phase, samples, latency, download, upload } = state;
  const metrics: MetricValue[] = [
    {
      key: "download",
      value: phase === "download" ? state.liveMbps : (download?.mbps ?? null),
      state: phase === "download" ? "active" : download ? "done" : "pending",
      detail: download ? `${formatBytes(download.bytes)} in ${(download.durationMs / 1000).toFixed(1)} s` : undefined,
    },
    {
      key: "upload",
      value: phase === "upload" ? state.liveMbps : (upload?.mbps ?? null),
      state: phase === "upload" ? "active" : upload ? "done" : "pending",
      detail: upload ? `${formatBytes(upload.bytes)} in ${(upload.durationMs / 1000).toFixed(1)} s` : undefined,
    },
    {
      key: "ping",
      value: latency?.avg ?? (samples.length ? mean(samples) : null),
      state: phase === "ping" ? "active" : samples.length || latency ? "done" : "pending",
      detail: latency
        ? `min ${formatMs(latency.min)} · max ${formatMs(latency.max)}${latency.lost ? ` · ${latency.lost} lost` : ""}`
        : undefined,
    },
    {
      key: "jitter",
      value: latency?.jitter ?? (phase === "jitter" && samples.length > 1 ? jitter(samples) : null),
      state: phase === "jitter" ? "active" : latency ? "done" : "pending",
      detail: latency ? `${latency.samples.length} samples` : undefined,
    },
  ];

  const tone: GaugeTone =
    phase === "ping" || phase === "jitter"
      ? "latency"
      : phase === "download" || phase === "upload"
        ? phase
        : phase === "complete"
          ? "complete"
          : "idle";
  const gaugeMbps = phase === "download" || phase === "upload" ? state.liveMbps : phase === "complete" ? (download?.mbps ?? 0) : 0;
  const lastSample = samples.length ? samples[samples.length - 1] : null;
  const shownServer = running ? state.testedServer : server;
  const probe = shownServer ? probes[shownServer.id] : undefined;

  return (
    <section aria-labelledby="test-title" className="mx-auto mt-8 w-full max-w-5xl px-4 sm:mt-12 sm:px-5">
      <h2 id="test-title" className="sr-only">
        Speed test
      </h2>
      <div className="glass relative overflow-hidden rounded-[28px] p-4 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent" />

        <ResultCards metrics={metrics} highlight={phase === "complete"} />

        {/* Live status for screen readers */}
        <p className="sr-only" role="status" aria-live="polite">
          {phaseAnnouncement(state)}
        </p>

        <div className="relative mt-6 sm:mt-8">
          <Speedometer
            mbps={gaugeMbps}
            tone={tone}
            showReadout={phase === "download" || phase === "upload"}
            label={phase === "download" ? "Download" : phase === "upload" ? "Upload" : undefined}
          >
            <GaugeCenter
              phase={phase}
              lastSample={lastSample}
              results={state.results}
              canStart={!!server}
              locating={locating}
              onStart={start}
            />
          </Speedometer>
        </div>

        {/* Controls */}
        <div className="mt-2 flex min-h-[112px] flex-col items-center justify-start gap-4">
          <AnimatePresence mode="wait" initial={false}>
            {running ? (
              <motion.div
                key="running"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex w-full max-w-md flex-col items-center gap-4"
              >
                <PhaseStepper phase={phase} progress={state.progress} />
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger/10 px-5 py-2.5 text-sm font-semibold text-fg transition hover:bg-danger/20 focus-visible:outline-danger"
                >
                  <Square className="h-3.5 w-3.5 fill-current text-danger" aria-hidden />
                  Stop test
                </button>
              </motion.div>
            ) : phase === "complete" ? (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-wrap items-center justify-center gap-3"
              >
                <button
                  type="button"
                  onClick={start}
                  disabled={!server}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-cyan px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(139,92,246,0.8)] transition hover:brightness-110 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Retest
                </button>
                <button
                  type="button"
                  onClick={copyResults}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-fg transition hover:border-cyan/50 hover:bg-cyan/10"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy results
                </button>
              </motion.div>
            ) : (
              <motion.p
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("max-w-md text-center text-sm", phase === "error" ? "text-danger" : "text-muted")}
              >
                {phase === "error"
                  ? state.error
                  : phase === "cancelled"
                    ? "Test stopped. Press start to run it again."
                    : "The test takes about 25 seconds and transfers up to a few hundred MB on fast connections."}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Selected server */}
        <div className="mt-2 flex flex-col items-center justify-center gap-2 border-t border-white/[0.06] pt-5 text-sm sm:flex-row sm:gap-3">
          <span className="flex items-center gap-2 text-muted">
            <Server className="h-4 w-4 text-cyan" aria-hidden />
            Testing with:
            <span className="font-medium text-fg">{shownServer ? shownServer.name : locating ? "Finding the best server…" : "No server available"}</span>
          </span>
          {shownServer && (
            <span className="text-xs text-muted">
              {describeLocation(shownServer, probe)}
              {probe?.latencyMs != null && <span className="ml-2 font-mono text-success">{formatMs(probe.latencyMs)} ms</span>}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenServers}
            disabled={running}
            className="rounded-full px-3 py-1 text-xs font-medium text-cyan transition hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Change server
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function GaugeCenter({
  phase,
  lastSample,
  results,
  canStart,
  locating,
  onStart,
}: {
  phase: TestPhase;
  lastSample: number | null;
  results: TestResults | null;
  canStart: boolean;
  locating: boolean;
  onStart: () => void;
}) {
  if (phase === "ping" || phase === "jitter") {
    return (
      <div className="flex translate-y-[12%] flex-col items-center">
        <span className="relative mb-4 grid h-14 w-14 place-items-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-success/60" />
          <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-success/40 [animation-delay:1.2s]" />
          <span className="h-3 w-3 rounded-full bg-success shadow-[0_0_20px_4px_rgba(34,197,94,0.6)]" />
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          {phase === "ping" ? "Measuring ping" : "Measuring jitter"}
        </span>
        <span className="mt-1 font-mono text-5xl font-semibold text-fg tabular">{formatMs(lastSample)}</span>
        <span className="mt-1 text-sm text-muted">ms</span>
      </div>
    );
  }

  if (phase === "complete" && results) {
    return (
      <motion.div
        className="flex translate-y-[14%] flex-col items-center"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <span className="relative mb-3 grid h-11 w-11 place-items-center rounded-full bg-success/15 text-success">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 1, opacity: 0.9 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">Download</span>
        <span className="font-mono text-5xl font-semibold text-fg tabular sm:text-6xl">{formatMbps(results.download.mbps)}</span>
        <span className="mt-1 text-sm text-muted">
          Mbps · <span className="text-primary-soft">↑ {formatMbps(results.upload.mbps)}</span>
        </span>
      </motion.div>
    );
  }

  // idle / cancelled / error → start button
  const label = phase === "error" ? "Try again" : phase === "cancelled" ? "Restart" : "Start";
  return (
    <div className="relative grid place-items-center">
      {canStart && (
        <>
          <span aria-hidden className="absolute h-40 w-40 animate-pulse-ring rounded-full border border-cyan/40 sm:h-48 sm:w-48" />
          <span aria-hidden className="absolute h-40 w-40 animate-pulse-ring rounded-full border border-primary/40 [animation-delay:1.2s] sm:h-48 sm:w-48" />
        </>
      )}
      <motion.button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        whileHover={canStart ? { scale: 1.04 } : undefined}
        whileTap={canStart ? { scale: 0.97 } : undefined}
        aria-label={canStart ? `${label} speed test` : locating ? "Finding the best server" : "No server available"}
        className="group relative grid h-40 w-40 place-items-center rounded-full p-[2px] disabled:cursor-not-allowed sm:h-48 sm:w-48"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full bg-[conic-gradient(from_180deg,#8B5CF6,#00D4FF,#8B5CF6)]",
            canStart ? "animate-spin-slow opacity-100" : "opacity-30",
          )}
        />
        <span className="relative flex h-full w-full flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#1e2a44,#0b1020_70%)] shadow-[inset_0_0_40px_rgba(139,92,246,0.25),0_0_60px_-10px_rgba(0,212,255,0.5)]">
          {canStart ? (
            <>
              <Play className="mb-1 h-6 w-6 fill-current text-cyan transition group-hover:scale-110" aria-hidden />
              <span className="text-2xl font-bold tracking-[0.12em] text-fg sm:text-3xl">{label.toUpperCase()}</span>
              <span className="mt-0.5 text-[11px] font-semibold tracking-[0.3em] text-muted">TEST</span>
            </>
          ) : (
            <>
              <LoaderCircle className={cn("h-7 w-7 text-cyan", locating && "animate-spin")} aria-hidden />
              <span className="mt-2 px-6 text-center text-xs text-muted">{locating ? "Finding best server…" : "No reachable server"}</span>
            </>
          )}
        </span>
      </motion.button>
    </div>
  );
}

function PhaseStepper({ phase, progress }: { phase: TestPhase; progress: number }) {
  const currentIndex = STEPS.findIndex((s) => s.key === phase);
  const overall = (currentIndex + Math.min(1, progress)) / (STEPS.length - 1);

  return (
    <div className="w-full">
      <ol className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.12em] sm:text-xs">
        {STEPS.map((step, i) => (
          <li
            key={step.key}
            aria-current={i === currentIndex ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              i < currentIndex ? "text-success" : i === currentIndex ? "text-fg" : "text-muted/50",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i < currentIndex ? "bg-success" : i === currentIndex ? "animate-pulse bg-cyan" : "bg-white/20",
              )}
            />
            {step.label}
          </li>
        ))}
      </ol>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label="Overall test progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(overall * 100)}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-cyan shadow-[0_0_12px_rgba(0,212,255,0.6)]"
          animate={{ width: `${Math.min(100, overall * 100)}%` }}
          transition={{ ease: "linear", duration: 0.25 }}
        />
      </div>
    </div>
  );
}

function phaseAnnouncement(state: State): string {
  switch (state.phase) {
    case "ping":
      return "Measuring ping";
    case "jitter":
      return "Measuring jitter";
    case "download":
      return "Measuring download speed";
    case "upload":
      return "Measuring upload speed";
    case "complete":
      return state.results
        ? `Test complete. Download ${formatMbps(state.results.download.mbps)} megabits per second, upload ${formatMbps(state.results.upload.mbps)} megabits per second, ping ${formatMs(state.results.latency.avg)} milliseconds, jitter ${formatMs(state.results.latency.jitter)} milliseconds.`
        : "Test complete";
    case "cancelled":
      return "Test stopped";
    case "error":
      return `Test failed: ${state.error ?? ""}`;
    default:
      return "";
  }
}
