import "server-only";
import type { SpeedTestServer } from "@/types/speedtest";

/**
 * Server configuration.
 *
 * Servers come from the `SPEEDTEST_SERVERS` environment variable (a JSON
 * array). When it is unset, two real endpoints are offered:
 *
 *  1. This deployment's own API routes (`/api/speedtest/*`) — always present.
 *  2. Cloudflare's public speed-test edge (CORS-enabled, anycast).
 *
 * No server is ever shown as available without a live probe from the
 * browser; unreachable servers are marked offline in the selector.
 */

const MB = 1024 * 1024;

export const LIMITS = {
  /** Max bytes per download request served by this app. */
  maxDownloadBytes: readPositiveInt("SPEEDTEST_MAX_DOWNLOAD_BYTES", 25 * MB, 100 * MB),
  /** Max body size per upload request accepted by this app. */
  maxUploadBytes: readPositiveInt("SPEEDTEST_MAX_UPLOAD_BYTES", 8 * MB, 64 * MB),
} as const;

function readPositiveInt(name: string, fallback: number, ceiling: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, ceiling);
}

function originServer(): SpeedTestServer {
  return {
    id: "origin",
    name: process.env.SPEEDTEST_ORIGIN_NAME || "PulseTest Origin",
    provider: "This deployment",
    city: process.env.SPEEDTEST_ORIGIN_CITY || undefined,
    country: process.env.SPEEDTEST_ORIGIN_COUNTRY || undefined,
    pingUrl: "/api/speedtest/ping",
    downloadUrl: "/api/speedtest/download?bytes={bytes}",
    uploadUrl: "/api/speedtest/upload",
    maxDownloadBytes: LIMITS.maxDownloadBytes,
    maxUploadBytes: LIMITS.maxUploadBytes,
    locationHeader: "x-speedtest-region",
  };
}

const CLOUDFLARE: SpeedTestServer = {
  id: "cloudflare",
  name: "Cloudflare Edge",
  provider: "Cloudflare",
  pingUrl: "https://speed.cloudflare.com/__down?bytes=0",
  downloadUrl: "https://speed.cloudflare.com/__down?bytes={bytes}",
  uploadUrl: "https://speed.cloudflare.com/__up",
  maxDownloadBytes: 25 * MB,
  maxUploadBytes: 8 * MB,
  // Exposed via Access-Control-Expose-Headers; IATA code of the serving PoP.
  locationHeader: "cf-meta-colo",
};

/* ------------------------------------------------------------------ */
/* Validation (no schema library needed for this small shape)          */
/* ------------------------------------------------------------------ */

function isEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function optionalString(value: unknown, max = 80): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : undefined;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? Math.min(value, 100 * MB) : fallback;
}

export function parseServer(input: unknown, index: number): SpeedTestServer | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = optionalString(raw.name);
  const { pingUrl, downloadUrl, uploadUrl } = raw;

  if (!name || !isEndpoint(pingUrl) || !isEndpoint(downloadUrl) || !isEndpoint(uploadUrl)) {
    return null;
  }
  if (!downloadUrl.includes("{bytes}")) return null;

  const id = optionalString(raw.id, 40)?.replace(/[^a-z0-9_-]/gi, "") || `server-${index}`;
  return {
    id,
    name,
    provider: optionalString(raw.provider) ?? "Custom",
    city: optionalString(raw.city),
    country: optionalString(raw.country),
    pingUrl,
    downloadUrl,
    uploadUrl,
    maxDownloadBytes: positiveInt(raw.maxDownloadBytes, 25 * MB),
    maxUploadBytes: positiveInt(raw.maxUploadBytes, 8 * MB),
    locationHeader: optionalString(raw.locationHeader, 64),
  };
}

/**
 * Resolves the configured server list. Evaluated when the page is
 * prerendered, so changing `SPEEDTEST_SERVERS` requires a rebuild.
 */
export function getServers(): SpeedTestServer[] {
  const raw = process.env.SPEEDTEST_SERVERS;
  if (!raw) return [originServer(), CLOUDFLARE];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("SPEEDTEST_SERVERS must be a JSON array");
    const servers = parsed
      .map((entry, i) => parseServer(entry, i))
      .filter((s): s is SpeedTestServer => s !== null);

    const includeOrigin = process.env.SPEEDTEST_INCLUDE_ORIGIN !== "false";
    const all = includeOrigin ? [originServer(), ...servers] : servers;
    // De-duplicate ids so React keys and selection stay stable.
    const seen = new Set<string>();
    const unique = all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    return unique.length > 0 ? unique : [originServer()];
  } catch (error) {
    console.error("[speedtest] Invalid SPEEDTEST_SERVERS, falling back to defaults:", error);
    return [originServer(), CLOUDFLARE];
  }
}
