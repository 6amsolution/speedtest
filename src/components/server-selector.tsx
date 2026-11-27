"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LoaderCircle, MapPin, RefreshCw, Search, Sparkles, WifiOff, X } from "lucide-react";
import { formatMs } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { ServerProbe, SpeedTestServer } from "@/types/speedtest";

interface ServerSelectorProps {
  open: boolean;
  onClose: () => void;
  servers: SpeedTestServer[];
  probes: Record<string, ServerProbe>;
  selectedId: string | null;
  /** True when the selection follows the best server automatically. */
  autoMode: boolean;
  bestId: string | null;
  onSelect: (id: string) => void;
  onAuto: () => void;
  onRefresh: () => void;
}

export function describeLocation(server: SpeedTestServer, probe?: ServerProbe): string {
  const place = [server.city, server.country].filter(Boolean).join(", ");
  if (place) return place;
  if (probe?.liveLocation) return `Served from ${probe.liveLocation}`;
  return "Location not published";
}

function latencyTone(ms: number) {
  if (ms < 40) return "text-success";
  if (ms < 100) return "text-cyan";
  return "text-primary-soft";
}

export function ServerSelector(props: ServerSelectorProps) {
  return (
    <AnimatePresence>
      {props.open && <SelectorDialog {...props} />}
    </AnimatePresence>
  );
}

function SelectorDialog({
  onClose,
  servers,
  probes,
  selectedId,
  autoMode,
  bestId,
  onSelect,
  onAuto,
  onRefresh,
}: ServerSelectorProps) {
  const [query, setQuery] = useState("");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus management, Escape to close, simple focus trap, scroll lock.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? servers.filter((s) =>
          [s.name, s.provider, s.city, s.country, probes[s.id]?.liveLocation]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q)),
        )
      : servers;
    // Online first (by latency), then probing, then offline.
    const rank = (s: SpeedTestServer) => {
      const p = probes[s.id];
      if (p?.status === "online") return p.latencyMs ?? 0;
      if (p?.status === "probing") return 1e6;
      return 1e7;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [query, servers, probes]);

  const anyProbing = servers.some((s) => probes[s.id]?.status === "probing");

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-bg/70 backdrop-blur-md" onClick={onClose} aria-hidden />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="glass relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card/90 sm:rounded-3xl"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 pb-3 sm:p-6 sm:pb-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              Select a server
            </h2>
            <p className="mt-0.5 text-sm text-muted">Latency is measured live from your browser.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted transition hover:bg-white/10 hover:text-fg"
            aria-label="Close server selection"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Search + actions */}
        <div className="space-y-3 px-5 sm:px-6">
          <label className="relative block">
            <span className="sr-only">Search servers</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, provider, city or country"
              className="h-11 w-full rounded-xl border border-white/10 bg-secondary/70 pl-10 pr-3 text-sm text-fg placeholder:text-muted/70 outline-none transition focus:border-cyan/50 focus:ring-2 focus:ring-cyan/20"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAuto}
              disabled={!bestId}
              aria-pressed={autoMode}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                autoMode
                  ? "border-primary/50 bg-primary/15 text-fg"
                  : "border-white/10 bg-white/[0.03] text-muted hover:border-primary/40 hover:text-fg",
              )}
            >
              <Sparkles className="h-4 w-4 text-primary-soft" aria-hidden />
              Auto-select best
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={anyProbing}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-muted transition hover:border-cyan/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", anyProbing && "animate-spin")} aria-hidden />
              <span className="hidden sm:inline">Re-measure</span>
              <span className="sr-only sm:hidden">Re-measure latency</span>
            </button>
          </div>
        </div>

        {/* List */}
        <ul className="mt-4 flex-1 space-y-2 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6" aria-label="Available servers">
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted">
              No servers match “{query}”.
            </li>
          )}
          {filtered.map((server) => {
            const probe = probes[server.id];
            const online = probe?.status === "online";
            const probing = probe?.status === "probing";
            const selected = server.id === selectedId;
            return (
              <li key={server.id}>
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => onSelect(server.id)}
                  aria-pressed={selected}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition",
                    selected
                      ? "border-cyan/50 bg-cyan/[0.07] shadow-[0_0_0_1px_rgba(0,212,255,0.15),0_10px_30px_-12px_rgba(0,212,255,0.35)]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                    !online && "cursor-not-allowed opacity-55 hover:border-white/[0.07] hover:bg-white/[0.02]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                      selected ? "bg-cyan/15 text-cyan" : "bg-white/[0.05] text-muted",
                    )}
                  >
                    {selected ? <Check className="h-5 w-5" aria-hidden /> : <MapPin className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{server.name}</span>
                      {server.id === bestId && (
                        <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                          Best
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {server.provider} · {describeLocation(server, probe)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {probing && (
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        Testing
                      </span>
                    )}
                    {online && probe.latencyMs != null && (
                      <span className={cn("font-mono text-sm font-semibold tabular", latencyTone(probe.latencyMs))}>
                        {formatMs(probe.latencyMs)}
                        <span className="ml-0.5 text-[11px] font-normal text-muted">ms</span>
                      </span>
                    )}
                    {probe?.status === "offline" && (
                      <span className="flex items-center gap-1.5 text-xs text-danger">
                        <WifiOff className="h-3.5 w-3.5" aria-hidden />
                        {probe.error ?? "Unavailable"}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </motion.div>
  );
}
