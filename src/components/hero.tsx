/** Server Component: static headline, animated in with CSS only. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative mx-auto max-w-3xl px-5 pt-10 text-center sm:pt-16">
      <p className="mx-auto mb-5 inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Real measurements · Real servers · No mock data
      </p>
      <h1
        id="hero-title"
        className="animate-fade-up text-balance text-4xl font-semibold tracking-tight text-fg [animation-delay:80ms] sm:text-6xl"
      >
        How Fast Is Your <span className="text-gradient">Internet?</span>
      </h1>
      <p className="mx-auto mt-5 max-w-xl animate-fade-up text-pretty text-base leading-relaxed text-muted [animation-delay:160ms] sm:text-lg">
        Discover your true internet speed with real-time download, upload, and latency testing.
      </p>
    </section>
  );
}
