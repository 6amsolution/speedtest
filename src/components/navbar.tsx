"use client";

import { ChevronDown, LoaderCircle, Server } from "lucide-react";
import { LogoMark } from "./logo";
import { formatMs } from "@/lib/calculations";
import type { ServerProbe, SpeedTestServer } from "@/types/speedtest";

interface NavbarProps {
  server: SpeedTestServer | null;
  probe: ServerProbe | undefined;
  disabled: boolean;
  onOpenServers: () => void;
}

export function Navbar({ server, probe, disabled, onOpenServers }: NavbarProps) {
  const probing = !server && probe?.status !== "offline";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-bg/60 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#" className="flex items-center gap-3 rounded-lg" aria-label="PulseTest home">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-[0.18em] text-fg">PULSETEST</span>
            <span className="mt-1 hidden text-[11px] font-medium text-muted sm:block">Internet Performance Test</span>
          </span>
        </a>

        <button
          type="button"
          onClick={onOpenServers}
          disabled={disabled}
          aria-haspopup="dialog"
          title={disabled ? "Server can't be changed while a test is running" : "Choose a test server"}
          className="group flex min-w-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-3 text-sm text-fg transition hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-cyan/20">
            {probing ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan" aria-hidden />
            ) : (
              <Server className="h-3.5 w-3.5 text-cyan" aria-hidden />
            )}
          </span>
          <span className="min-w-0 truncate font-medium">
            {server ? server.name : probing ? "Finding server…" : "Select server"}
          </span>
          {server && probe?.latencyMs != null && (
            <span className="hidden font-mono text-xs text-success tabular sm:inline">{formatMs(probe.latencyMs)} ms</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-hover:text-fg" aria-hidden />
        </button>
      </nav>
    </header>
  );
}
