"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Navbar } from "./navbar";
import { SpeedTest } from "./speed-test";
import { ServerSelector } from "./server-selector";
import { Toaster, useToasts } from "./toast";
import { useServerProbes } from "@/lib/use-server-probes";
import type { SpeedTestServer } from "@/types/speedtest";

interface SpeedTestAppProps {
  servers: SpeedTestServer[];
  /** Server-rendered hero, slotted between the navbar and the test. */
  hero: ReactNode;
}

/**
 * Client root that shares server selection between the navbar, the test
 * panel and the selector modal.
 */
export function SpeedTestApp({ servers, hero }: SpeedTestAppProps) {
  const { probes, refresh, bestId, settled } = useServerProbes(servers);
  const [manualId, setManualId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  // A manual choice wins while that server is reachable; otherwise follow the best one.
  const manualOnline = manualId !== null && probes[manualId]?.status === "online";
  const selectedId = manualOnline ? manualId : bestId;
  const server = servers.find((s) => s.id === selectedId) ?? null;
  const locating = !server && !settled;

  const openSelector = useCallback(() => setSelectorOpen(true), []);
  const closeSelector = useCallback(() => setSelectorOpen(false), []);

  const select = useCallback(
    (id: string) => {
      setManualId(id);
      setSelectorOpen(false);
      const chosen = servers.find((s) => s.id === id);
      if (chosen) push({ kind: "info", title: `Server set to ${chosen.name}` });
    },
    [servers, push],
  );

  const selectAuto = useCallback(() => {
    setManualId(null);
    setSelectorOpen(false);
  }, []);

  return (
    <>
      <Navbar
        server={server}
        probe={server ? probes[server.id] : undefined}
        disabled={running}
        onOpenServers={openSelector}
      />
      <main id="main">
        {hero}
        <SpeedTest
          server={server}
          probes={probes}
          locating={locating}
          onRunningChange={setRunning}
          onOpenServers={openSelector}
          notify={push}
        />
        {settled && !bestId && (
          <p role="alert" className="mx-auto mt-4 max-w-md px-5 text-center text-sm text-danger">
            None of the configured test servers responded. Check your connection, then{" "}
            <button type="button" onClick={refresh} className="font-semibold text-cyan underline underline-offset-4">
              retry
            </button>
            .
          </p>
        )}
      </main>
      <ServerSelector
        open={selectorOpen && !running}
        onClose={closeSelector}
        servers={servers}
        probes={probes}
        selectedId={selectedId}
        autoMode={!manualOnline}
        bestId={bestId}
        onSelect={select}
        onAuto={selectAuto}
        onRefresh={refresh}
      />
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
