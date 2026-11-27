/** Joins truthy class names. Tiny on purpose — avoids pulling in clsx/tailwind-merge. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Returns an AbortController that aborts when any parent signal aborts or,
 * optionally, after `timeoutMs`. Call `dispose()` to release listeners.
 */
export function linkedController(parents: Array<AbortSignal | undefined>, timeoutMs?: number) {
  const controller = new AbortController();
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const cleanups: Array<() => void> = [];

  for (const parent of parents) {
    if (!parent) continue;
    if (parent.aborted) {
      abort(parent.reason);
      break;
    }
    const onAbort = () => abort(parent.reason);
    parent.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => parent.removeEventListener("abort", onAbort));
  }

  if (timeoutMs !== undefined) {
    const timer = setTimeout(
      () => abort(new DOMException(`Timed out after ${timeoutMs} ms`, "TimeoutError")),
      timeoutMs,
    );
    cleanups.push(() => clearTimeout(timer));
  }

  return {
    controller,
    signal: controller.signal,
    dispose: () => cleanups.forEach((fn) => fn()),
  };
}

/** Appends a cache-busting query parameter so no layer can serve a cached copy. */
export function bustCache(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}nocache=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
