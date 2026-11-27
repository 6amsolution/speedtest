/** Pure math helpers for the speed-test engine. No I/O, fully deterministic. */

export function bytesToMbps(bytes: number, ms: number): number {
  if (ms <= 0 || bytes <= 0) return 0;
  // bits / microseconds === megabits / second
  return (bytes * 8) / (ms * 1000);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Jitter as the mean absolute difference between consecutive samples
 * (the same definition used by RFC 3550-style "packet delay variation").
 */
export function jitter(samples: readonly number[]): number {
  if (samples.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    total += Math.abs(samples[i] - samples[i - 1]);
  }
  return total / (samples.length - 1);
}

export function latencyStats(samples: readonly number[]) {
  if (samples.length === 0) {
    return { avg: 0, min: 0, max: 0, jitter: 0 };
  }
  return {
    avg: mean(samples),
    min: Math.min(...samples),
    max: Math.max(...samples),
    jitter: jitter(samples),
  };
}

export interface ByteSample {
  /** ms since the start of the phase */
  t: number;
  /** cumulative bytes at time t */
  bytes: number;
}

/** Throughput over the trailing `windowMs` of a cumulative byte timeline. */
export function windowedMbps(timeline: readonly ByteSample[], windowMs: number): number {
  if (timeline.length < 2) return 0;
  const last = timeline[timeline.length - 1];
  let first = timeline[0];
  for (let i = timeline.length - 2; i >= 0; i--) {
    first = timeline[i];
    if (last.t - first.t >= windowMs) break;
  }
  return bytesToMbps(last.bytes - first.bytes, last.t - first.t);
}

/**
 * Final throughput: bytes moved after the TCP ramp-up period divided by the
 * time spent moving them. If the phase ended before the warm-up finished
 * (very fast links hitting the byte cap), the whole window is used.
 */
export function steadyStateMbps(timeline: readonly ByteSample[], warmupMs: number): number {
  if (timeline.length < 2) return 0;
  const last = timeline[timeline.length - 1];
  const start = timeline.find((s) => s.t >= warmupMs);
  if (!start || last.t - start.t < 500) {
    return bytesToMbps(last.bytes, last.t);
  }
  return bytesToMbps(last.bytes - start.bytes, last.t - start.t);
}

/** Gauge scale ticks (Mbps), non-linear so slow and fast links both read well. */
export const GAUGE_TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000] as const;

/** Maps Mbps onto 0..1 along the piecewise-linear gauge scale. */
export function speedToFraction(mbps: number): number {
  if (!Number.isFinite(mbps) || mbps <= 0) return 0;
  const ticks = GAUGE_TICKS;
  const segment = 1 / (ticks.length - 1);
  for (let i = 1; i < ticks.length; i++) {
    if (mbps <= ticks[i]) {
      const local = (mbps - ticks[i - 1]) / (ticks[i] - ticks[i - 1]);
      return (i - 1 + local) * segment;
    }
  }
  return 1;
}

export function formatMbps(mbps: number): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return "0";
  if (mbps < 10) return mbps.toFixed(2);
  if (mbps < 100) return mbps.toFixed(1);
  return Math.round(mbps).toString();
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 10) return ms.toFixed(1);
  return Math.round(ms).toString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
