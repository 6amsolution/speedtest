"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";
import { GAUGE_TICKS, formatMbps, speedToFraction } from "@/lib/calculations";
import { cn } from "@/lib/utils";

/* Geometry ---------------------------------------------------------- */
const SIZE = 400;
const C = SIZE / 2;
const R = 164;
const START = -135; // degrees, 0 = straight up
const SWEEP = 270;

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) };
}

function arcPath(radius: number) {
  const s = polar(START, radius);
  const e = polar(START + SWEEP, radius);
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 1 1 ${e.x} ${e.y}`;
}

const ARC = arcPath(R);
const MINOR_TICKS = Array.from({ length: 41 }, (_, i) => START + (i / 40) * SWEEP);

export type GaugeTone = "idle" | "latency" | "download" | "upload" | "complete";

const TONE: Record<GaugeTone, { from: string; to: string; glow: string }> = {
  idle: { from: "#8B5CF6", to: "#00D4FF", glow: "rgba(139,92,246,0.35)" },
  latency: { from: "#22C55E", to: "#00D4FF", glow: "rgba(34,197,94,0.35)" },
  download: { from: "#8B5CF6", to: "#00D4FF", glow: "rgba(0,212,255,0.45)" },
  upload: { from: "#00D4FF", to: "#8B5CF6", glow: "rgba(139,92,246,0.5)" },
  complete: { from: "#8B5CF6", to: "#00D4FF", glow: "rgba(0,212,255,0.35)" },
};

interface SpeedometerProps {
  /** Speed in Mbps that drives the needle and arc. */
  mbps: number;
  tone: GaugeTone;
  /** Content rendered in the gauge centre (readout, buttons…). */
  children?: ReactNode;
  /** When provided, the live readout shows this number instead of `mbps`. */
  showReadout?: boolean;
  label?: string;
  unit?: string;
  className?: string;
}

export function Speedometer({ mbps, tone, children, showReadout = false, label, unit = "Mbps", className }: SpeedometerProps) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(0, reduceMotion ? { stiffness: 1000, damping: 100 } : { stiffness: 70, damping: 18, mass: 0.9 });
  const value = useSpring(0, reduceMotion ? { stiffness: 1000, damping: 100 } : { stiffness: 60, damping: 20 });

  const arcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    spring.set(speedToFraction(mbps));
    value.set(Math.max(0, mbps));
  }, [mbps, spring, value]);

  useMotionValueEvent(spring, "change", (fraction) => {
    const f = Math.min(1, Math.max(0, fraction));
    arcRef.current?.setAttribute("stroke-dasharray", `${f} 1`);
    needleRef.current?.setAttribute("transform", `rotate(${START + f * SWEEP} ${C} ${C})`);
  });

  useMotionValueEvent(value, "change", (v) => {
    if (readoutRef.current) readoutRef.current.textContent = formatMbps(v);
  });

  const colors = TONE[tone];
  const active = tone === "download" || tone === "upload";

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[min(88vw,440px)]", className)}>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full blur-3xl transition-[background] duration-700"
        style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)` }}
      />

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.from} />
            <stop offset="100%" stopColor={colors.to} />
          </linearGradient>
          <radialGradient id="gauge-face" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#172033" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#080B14" stopOpacity="0.2" />
          </radialGradient>
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="needle-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0" />
            <stop offset="100%" stopColor="#F8FAFC" />
          </linearGradient>
        </defs>

        {/* Face */}
        <circle cx={C} cy={C} r={R - 22} fill="url(#gauge-face)" />
        <circle cx={C} cy={C} r={R + 18} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

        {/* Minor ticks */}
        {MINOR_TICKS.map((angle, i) => {
          const outer = polar(angle, R - 18);
          const inner = polar(angle, R - (i % 5 === 0 ? 30 : 24));
          return (
            <line
              key={angle}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={i % 5 === 0 ? "rgba(248,250,252,0.35)" : "rgba(148,163,184,0.18)"}
              strokeWidth={i % 5 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Scale labels */}
        {GAUGE_TICKS.map((tick, i) => {
          const angle = START + (i / (GAUGE_TICKS.length - 1)) * SWEEP;
          const p = polar(angle, R - 50);
          return (
            <text
              key={tick}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted font-mono text-[13px]"
            >
              {tick}
            </text>
          );
        })}

        {/* Track */}
        <path d={ARC} fill="none" stroke="#172033" strokeWidth="16" strokeLinecap="round" />
        {/* Progress arc */}
        <path
          ref={arcRef}
          d={ARC}
          pathLength={1}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray="0 1"
          filter="url(#gauge-glow)"
          className={cn("transition-opacity duration-500", tone === "idle" ? "opacity-0" : "opacity-100")}
        />

        {/* Needle */}
        <g
          ref={needleRef}
          transform={`rotate(${START} ${C} ${C})`}
          className={cn("transition-opacity duration-500", active ? "opacity-100" : "opacity-0")}
        >
          <path d={`M ${C - 3.5} ${C - 96} L ${C} ${C - R + 34} L ${C + 3.5} ${C - 96} Z`} fill="url(#needle-grad)" />
          <circle cx={C} cy={C - R + 34} r="3" fill="#F8FAFC" filter="url(#gauge-glow)" />
        </g>
      </svg>

      {/* Centre content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showReadout ? (
          <div className="flex translate-y-[18%] flex-col items-center" aria-hidden>
            {label && <span className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-muted">{label}</span>}
            <span
              ref={readoutRef}
              className="font-mono text-5xl font-semibold tracking-tight text-fg tabular sm:text-6xl"
            >
              0
            </span>
            <span className="mt-1 text-sm text-muted">{unit}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
