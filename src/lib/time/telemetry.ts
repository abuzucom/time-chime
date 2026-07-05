/**
 * Structured telemetry for the syncTime server function.
 *
 * Emits ONE JSON line per event to stdout. Cloudflare's log pipeline (and
 * `stack_modern--server-function-logs`) preserves whole lines, so JSON stays
 * grep-able and can be piped to Logpush / Workers Analytics Engine / any
 * external SIEM without a code change. We deliberately avoid a metrics SDK:
 * no runtime dependency, no bundle-size cost, no PII surface.
 *
 * Privacy notes:
 * - The raw client IP NEVER appears in a log line. We salt-and-hash it and
 *   keep the first 12 hex chars — enough to correlate bursts from the same
 *   caller inside one hour window, not enough to re-identify a person.
 * - The salt rotates hourly, so hashes are not stable across hours and
 *   cannot be joined against an external rainbow table.
 * - Country and Cloudflare colo are coarse geo signals already present on
 *   every request; they're safe to log and useful for spotting regional
 *   abuse patterns.
 */

import { getRequestHeader } from "@tanstack/react-start/server";

export type SyncTimeReason =
  | "ok" // request served successfully with at least one provider sample
  | "all_providers_failed" // every probe returned no_response
  | "validation_error" // Zod rejected the input shape
  | "rate_limited" // burst limiter rejected the request before the handler ran
  | "internal_error"; // handler threw

export interface SyncTimeTelemetry {
  event: "synctime";
  reason: SyncTimeReason;
  /** ISO-8601 UTC timestamp; `Date.now()`-derived so it lines up with worker logs. */
  ts: string;
  /** Cloudflare colo code (e.g. "SJC") — coarse geographic hint. */
  colo: string | null;
  /** ISO country from CF-IPCountry, or null if unavailable. */
  country: string | null;
  /** Salted + truncated hash of the client IP. Rotates hourly. Never reversible. */
  ipHash: string | null;
  /** Provider IDs requested (order preserved). */
  providers: readonly string[];
  /** How many probes returned a usable timestamp. */
  okCount: number;
  /** How many probes failed (network, timeout, redirect, non-https, bad body). */
  failCount: number;
  /** Per-provider fail reasons, keyed by provider id. Empty when all ok. */
  failures: Record<string, string>;
  /** Total handler wall-clock time in ms. */
  durationMs: number;
  /** Provider id chosen as authoritative, or null when none succeeded. */
  bestProvider: string | null;
}

/**
 * Hash the client IP with an hourly-rotating salt so log analysis can
 * cluster requests from one caller within a window without ever persisting
 * a reversible identifier.
 */
async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  // Bucket to the current UTC hour so an attacker cannot precompute a
  // rainbow table for arbitrary IPs across time.
  const hourBucket = Math.floor(Date.now() / 3_600_000).toString(36);
  const salt = `westminster-synctime-v1:${hourBucket}`;
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

/**
 * Collect the request-scoped fields that every telemetry line needs, so the
 * caller only has to supply outcome-specific data.
 */
export async function collectRequestContext(): Promise<{
  colo: string | null;
  country: string | null;
  ipHash: string | null;
}> {
  const ip =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-real-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const [ipHash] = await Promise.all([hashIp(ip)]);
  return {
    colo: getRequestHeader("cf-ray")?.split("-")[1] ?? null,
    country: getRequestHeader("cf-ipcountry") ?? null,
    ipHash,
  };
}

/**
 * Emit one telemetry event. `console.log` is used deliberately: Cloudflare
 * Workers ships stdout to the log pipeline and Logpush can filter on the
 * `event` and `reason` fields directly.
 */
export function emitSyncTimeTelemetry(payload: SyncTimeTelemetry): void {
  // Single JSON.stringify call keeps the whole event on one line, which is
  // what downstream log parsers assume.
  console.log(JSON.stringify(payload));
}
