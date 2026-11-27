"use client";

import { motion } from "framer-motion";
import { Activity, ArrowDown, ArrowUp, Waves, type LucideIcon } from "lucide-react";
import { formatMbps, formatMs } from "@/lib/calculations";
import { cn } from "@/lib/utils";

export type MetricKey = "download" | "upload" | "ping" | "jitter";
export type MetricState = "pending" | "active" | "done";

export interface MetricValue {
  key: MetricKey;
  value: number | null;
  state: MetricState;
  /** Extra detail, e.g. "min 9 · max 14". */
  detail?: string;
}

const META: Record<MetricKey, { label: string; unit: string; icon: LucideIcon; accent: string; bar: string }> = {
  download: { label: "Download", unit: "Mbps", icon: ArrowDown, accent: "text-cyan", bar: "from-cyan to-primary" },
  upload: { label: "Upload", unit: "Mbps", icon: ArrowUp, accent: "text-primary-soft", bar: "from-primary to-cyan" },
  ping: { label: "Ping", unit: "ms", icon: Activity, accent: "text-success", bar: "from-success to-cyan" },
  jitter: { label: "Jitter", unit: "ms", icon: Waves, accent: "text-fg", bar: "from-white/70 to-primary-soft" },
};

function format(key: MetricKey, value: number | null): string {
  if (value == null) return "—";
  return key === "download" || key === "upload" ? formatMbps(value) : formatMs(value);
}

export function ResultCards({ metrics, highlight = false }: { metrics: MetricValue[]; highlight?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Test metrics">
      {metrics.map((metric, index) => (
        <ResultCard key={metric.key} metric={metric} highlight={highlight} index={index} />
      ))}
    </ul>
  );
}

function ResultCard({ metric, highlight, index }: { metric: MetricValue; highlight: boolean; index: number }) {
  const meta = META[metric.key];
  const Icon = meta.icon;
  const active = metric.state === "active";
  const done = metric.state === "done";

  return (
    <motion.li
      initial={false}
      animate={highlight ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={{ duration: 0.6, delay: highlight ? index * 0.08 : 0 }}
      className={cn(
        "glass relative overflow-hidden rounded-2xl p-4 transition-colors duration-300 sm:p-5",
        active && "border-cyan/30",
      )}
      aria-live={active ? "polite" : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(0,212,255,0.9),transparent)] bg-[length:200%_100%]"
        />
      )}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
          <Icon className={cn("h-4 w-4", meta.accent)} aria-hidden />
          {meta.label}
        </span>
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            active ? "animate-pulse bg-cyan" : done ? "bg-success" : "bg-white/15",
          )}
        />
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tracking-tight tabular transition-colors sm:text-3xl",
            metric.value == null ? "text-white/25" : "text-fg",
          )}
        >
          {format(metric.key, metric.value)}
        </span>
        <span className="text-xs text-muted">{meta.unit}</span>
        <span className="sr-only">
          {metric.state === "pending" ? "not measured yet" : active ? "measuring" : "final"}
        </span>
      </p>
      <p className="mt-1 h-4 truncate text-[11px] text-muted/80">{metric.detail ?? ""}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-[width] duration-700",
            meta.bar,
            done ? "w-full" : active ? "w-2/3 animate-pulse" : "w-0",
          )}
        />
      </div>
    </motion.li>
  );
}
