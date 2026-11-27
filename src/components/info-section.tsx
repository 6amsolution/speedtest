import { ArrowDown, ArrowUp, Activity, Waves } from "lucide-react";

const METRICS = [
  {
    icon: ArrowDown,
    title: "Download",
    unit: "Mbps",
    color: "text-cyan",
    ring: "from-cyan/25",
    body: "How fast data reaches you. We stream real payloads over 4 parallel connections for ~10 s and count every byte received.",
  },
  {
    icon: ArrowUp,
    title: "Upload",
    unit: "Mbps",
    color: "text-primary-soft",
    ring: "from-primary/30",
    body: "How fast you can send data. Random, incompressible payloads are POSTed to the server's upload endpoint over 3 connections.",
  },
  {
    icon: Activity,
    title: "Ping",
    unit: "ms",
    color: "text-success",
    ring: "from-success/25",
    body: "Round-trip time to the server, averaged over repeated requests after a discarded warm-up. Lower is better for gaming and calls.",
  },
  {
    icon: Waves,
    title: "Jitter",
    unit: "ms",
    color: "text-fg",
    ring: "from-white/15",
    body: "How much latency varies between consecutive pings. Low jitter means a stable connection for video and voice.",
  },
] as const;

/** Server Component: explains what each metric means and how it is measured. */
export function InfoSection() {
  return (
    <section id="about" aria-labelledby="about-title" className="mx-auto max-w-6xl px-5 pb-20 pt-8">
      <h2 id="about-title" className="text-center text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        What we measure
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
        Every number comes from real transfers between your browser and the selected server, timed with{" "}
        <code className="font-mono text-xs text-fg/80">performance.now()</code>.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map(({ icon: Icon, title, unit, color, ring, body }) => (
          <li key={title} className="glass group relative overflow-hidden rounded-2xl p-5 transition hover:-translate-y-0.5">
            <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${ring} to-transparent blur-2xl transition group-hover:scale-125`} />
            <div className="relative flex items-center justify-between">
              <span className={`grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] ${color}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-mono text-xs text-muted">{unit}</span>
            </div>
            <h3 className="relative mt-4 font-semibold text-fg">{title}</h3>
            <p className="relative mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
