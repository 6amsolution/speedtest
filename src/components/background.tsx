/** Decorative animated backdrop. Pure CSS, server-rendered, no JS cost. */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      {/* Gradient orbs */}
      <div className="absolute -left-[15%] -top-[20%] h-[70vmax] w-[70vmax] animate-drift rounded-full bg-[radial-gradient(circle,rgb(139_92_246/0.22),transparent_60%)] blur-3xl" />
      <div className="absolute -right-[20%] top-[10%] h-[60vmax] w-[60vmax] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgb(0_212_255/0.14),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[-30%] left-[20%] h-[50vmax] w-[50vmax] animate-drift rounded-full bg-[radial-gradient(circle,rgb(139_92_246/0.12),transparent_65%)] blur-3xl" />

      {/* Perspective grid fading out toward the edges */}
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_55%_at_50%_35%,black_20%,transparent_75%)]" />

      {/* Horizon glow line */}
      <div className="absolute inset-x-0 top-[62%] mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-cyan/30 to-transparent" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(8_11_20/0.85)_100%)]" />
    </div>
  );
}
