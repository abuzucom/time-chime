import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  collectRequestContext,
  emitSyncTimeTelemetry,
  type SyncTimeReason,
} from "./time/telemetry";
import { clientIpKey, createBurstLimiter } from "./http/burst-limiter";
import { jsonErrorResponse } from "./http/json-error";

/**
 * Per-isolate burst limiter for {@link syncTime}. 10 requests/minute/IP is
 * ~30× the app's own 15-second cooldown, so a well-behaved client will
 * never touch it; a runaway loop or scraper trips it immediately. See
 * `src/lib/http/burst-limiter.ts` for the (deliberate) scope limits — this
 * catches bursts on one isolate, not a global quota. Real quotas live in
 * Cloudflare Rate Limiting (docs/OPERATIONS.md).
 */
const syncTimeBurstLimiter = createBurstLimiter({
  limit: 10,
  windowMs: 60_000,
});

import {
  isPlausibleProviderTimestamp,
  parseProviderTimestamp,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  selectBestProvider,
  type ProviderId,
} from "./time/provider";

export { PROVIDER_CATALOG, PROVIDER_IDS };
export type { ProviderId };


const inputSchema = z.object({
  providers: z
    .array(z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]))
    .min(1)
    .max(PROVIDER_IDS.length),
});

async function extractMsFromJsonBody(res: Response, id: ProviderId): Promise<number | null> {
  try {
    const candidate = parseProviderTimestamp(await res.json());
    return candidate !== null && isPlausibleProviderTimestamp(candidate) ? candidate : null;
  } catch (err) {
    console.warn(`[time-sync] provider "${id}" returned unparseable JSON`, err);
    return null;
  }
}

/** Fetch the current reference time from a single HTTPS JSON provider. */
async function readProviderTime(id: ProviderId): Promise<number | null> {
  const provider = PROVIDER_CATALOG[id];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const parsed = new URL(provider.endpoint);
    if (parsed.protocol !== "https:") return null;
    const res = await fetch(provider.endpoint, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await extractMsFromJsonBody(res, id);
  } catch (err) {
    console.warn(`[time-sync] probe of provider "${id}" failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ProviderSample = {
  id: ProviderId;
  name: string;
  rttMs: number;
  ok: boolean;
  serverTimeMs?: number;
  error?: string;
};

export type TimeSyncResponse = {
  serverUnixMs: number;
  bestServerUnixMs: number;
  serverProcessingMs: number;
  sources: ProviderSample[];
  inferredCountry: string | null;
};

/**
 * Probe a single reference provider and shape the result for the client.
 *
 * Times the HTTPS round-trip locally and returns either an `ok: true`
 * sample carrying the parsed server time, or an `ok: false` sample with
 * the measured RTT so the UI can still surface which providers responded
 * (and how quickly) even when the timestamp itself was unusable.
 */
async function probeProvider(id: ProviderId): Promise<ProviderSample> {
  const provider = PROVIDER_CATALOG[id];
  const start = Date.now();
  const serverTimeMs = await readProviderTime(id);
  const rttMs = Date.now() - start;
  const common = {
    id,
    name: provider.name,
    rttMs,
  } as const;
  return serverTimeMs === null
    ? { ...common, ok: false, error: "no_response" }
    : { ...common, ok: true, serverTimeMs };
}

/**
 * TanStack server function: probe the user-selected reference providers
 * in parallel and return the best result.
 *
 * Runs on the edge and exposes the client's `CF-IPCountry` header for platform
 * telemetry. Time.now is preferred by application policy; otherwise the
 * lowest-RTT successful source wins.
 *
 * @param data.providers Up to 2 provider IDs to query in parallel.
 * @returns A {@link TimeSyncResponse} containing `bestServerUnixMs`,
 *          per-source results, server processing time, and inferred country.
 */
export const syncTime = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    // Validation failures are logged with reason="validation_error" so we
    // can spot malformed clients / probing without the handler ever running.
    try {
      return inputSchema.parse(data);
    } catch (err) {
      void collectRequestContext().then((ctx) => {
        emitSyncTimeTelemetry({
          event: "synctime",
          reason: "validation_error",
          ts: new Date().toISOString(),
          ...ctx,
          providers: [],
          okCount: 0,
          failCount: 0,
          failures: {},
          durationMs: 0,
          bestProvider: null,
        });
      });
      throw err;
    }
  })
  .handler(async ({ data }): Promise<TimeSyncResponse> => {
    const inferredCountry = getRequestHeader("cf-ipcountry") ?? null;
    const serverStart = Date.now();
    const requestCtx = await collectRequestContext();

    // Burst-limit BEFORE issuing outbound provider probes so a hot loop
    // cannot amplify a single client into 3× upstream requests each hit.
    // Missing IP (local dev / non-CF host) falls open — see clientIpKey.
    const ipKey = clientIpKey(getRequestHeader);
    if (ipKey !== null) {
      const decision = syncTimeBurstLimiter.check(ipKey);
      if (!decision.allowed) {
        emitSyncTimeTelemetry({
          event: "synctime",
          reason: "rate_limited",
          ts: new Date().toISOString(),
          ...requestCtx,
          providers: data.providers,
          okCount: 0,
          failCount: 0,
          failures: {},
          durationMs: Date.now() - serverStart,
          bestProvider: null,
        });
        // Throwing a Response is TanStack Start's contract for turning a
        // server-fn rejection into a real HTTP response the client sees.
        // Body shape matches the canonical JsonErrorBody envelope so
        // clients can branch on `error` and display `message` verbatim.
        throw jsonErrorResponse({
          status: 429,
          error: "rate_limited",
          message:
            "You've made too many time-sync requests in a short window. Please wait a moment before trying again.",
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }
    }

    try {
      const sources = await Promise.all(data.providers.map(probeProvider));

      const ok = sources.filter((s): s is Required<ProviderSample> & { ok: true } => s.ok);
      const best = selectBestProvider(ok);

      const serverProcessingMs = Date.now() - serverStart;

      // Collect per-provider failure reasons so log analysis can distinguish
      // "one flaky upstream" from "our entire outbound path is down".
      const failures: Record<string, string> = {};
      for (const source of sources) if (!source.ok) failures[source.id] = source.error ?? "unknown";

      const reason: SyncTimeReason = ok.length === 0 ? "all_providers_failed" : "ok";
      emitSyncTimeTelemetry({
        event: "synctime",
        reason,
        ts: new Date().toISOString(),
        ...requestCtx,
        providers: data.providers,
        okCount: ok.length,
        failCount: sources.length - ok.length,
        failures,
        durationMs: serverProcessingMs,
        bestProvider: best?.id ?? null,
      });

      return {
        serverUnixMs: Date.now(),
        bestServerUnixMs: best ? best.serverTimeMs : Date.now(),
        serverProcessingMs,
        sources,
        inferredCountry,
      };
    } catch (err) {
      emitSyncTimeTelemetry({
        event: "synctime",
        reason: "internal_error",
        ts: new Date().toISOString(),
        ...requestCtx,
        providers: data.providers,
        okCount: 0,
        failCount: data.providers.length,
        failures: { _handler: err instanceof Error ? err.name : "unknown" },
        durationMs: Date.now() - serverStart,
        bestProvider: null,
      });
      throw err;
    }
  });
