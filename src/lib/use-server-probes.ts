"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { probeServer } from "./speedtest";
import type { ServerProbe, SpeedTestServer } from "@/types/speedtest";

function initialProbes(servers: SpeedTestServer[]): Record<string, ServerProbe> {
  return Object.fromEntries(servers.map((s) => [s.id, { status: "probing", latencyMs: null } satisfies ServerProbe]));
}

/**
 * Probes every configured server from the browser (real round trips) and
 * reports reachability and latency. Servers that fail are marked offline —
 * they are never presented as available.
 */
export function useServerProbes(servers: SpeedTestServer[]) {
  const [probes, setProbes] = useState(() => initialProbes(servers));
  const [round, setRound] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Probe sequentially so concurrent probes don't inflate each other's latency.
    (async () => {
      for (const server of servers) {
        if (controller.signal.aborted) return;
        try {
          const { latencyMs, liveLocation } = await probeServer(server, controller.signal);
          if (controller.signal.aborted) return;
          setProbes((all) => ({ ...all, [server.id]: { status: "online", latencyMs, liveLocation } }));
        } catch (error) {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "Unreachable";
          setProbes((all) => ({
            ...all,
            [server.id]: { status: "offline", latencyMs: null, error: message.includes("Timed out") ? "Timed out" : "Unreachable" },
          }));
        }
      }
    })();
    return () => controller.abort();
  }, [servers, round]);

  const refresh = useCallback(() => {
    setProbes(initialProbes(servers));
    setRound((r) => r + 1);
  }, [servers]);

  /** Lowest-latency reachable server, or null while nothing has answered. */
  const bestId = useMemo(() => {
    let best: { id: string; ms: number } | null = null;
    for (const server of servers) {
      const probe = probes[server.id];
      if (probe?.status === "online" && probe.latencyMs != null && (!best || probe.latencyMs < best.ms)) {
        best = { id: server.id, ms: probe.latencyMs };
      }
    }
    return best?.id ?? null;
  }, [probes, servers]);

  const settled = servers.every((s) => probes[s.id]?.status !== "probing");

  return { probes, refresh, bestId, settled };
}
