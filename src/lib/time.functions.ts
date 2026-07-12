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

/**
 * Stratum-1-backed HTTPS time providers. Browsers cannot open raw UDP so we
 * cannot speak native NTP/NTS from the client; instead the server function
 * queries HTTPS endpoints operated by (or disciplined by) stratum-1 sources
 * and returns a corrected timestamp for the client to compute its offset.
 */
export const PROVIDER_CATALOG = {
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare Time (NTS)",
    operator: "Cloudflare",
    stratum: 1,
    region: "global",
    endpoint: "https://cloudflare.com/cdn-cgi/trace",
    ntsSupported: true,
    // Preferred anchor: globally anycast, NTS-authenticated, millisecond-precision
    // HTTP Date, and strict (unsmeared) UTC. Chosen over other ok sources unless
    // Cloudflare itself fails, in which case we fall back to lowest-RTT.
    preferred: true,
  },
  // Note: Google Public NTP is intentionally omitted — it serves leap-smeared
  // time (up to ~0.5 s off strict UTC during a smear window), which conflicts
  // with this app's "authoritative UTC" contract. Do not re-add without a
  // user-facing warning and an opt-in.
  nist: {
    id: "nist",
    name: "NIST (time.gov)",
    operator: "US National Institute of Standards and Technology",
    stratum: 1,
    region: "na",
    // NIST doesn't publish an HTTPS JSON time API; the HTTP Date header on
    // time.gov is disciplined by their stratum-1 sources (second precision).
    endpoint: "https://time.gov/",
    ntsSupported: false,
  },
  ptb: {
    id: "ptb",
    name: "PTB (Braunschweig)",
    operator: "Physikalisch-Technische Bundesanstalt (Germany)",
    stratum: 1,
    region: "eu",
    endpoint: "https://www.ptb.de/",
    ntsSupported: true,
  },
  metas: {
    id: "metas",
    name: "METAS (Bern)",
    operator: "Federal Institute of Metrology (Switzerland)",
    stratum: 1,
    region: "eu",
    endpoint: "https://www.metas.ch/",
    ntsSupported: false,
  },
  nrc: {
    id: "nrc",
    name: "NRC (Ottawa)",
    operator: "National Research Council Canada",
    stratum: 1,
    region: "na",
    endpoint: "https://nrc.canada.ca/en",
    ntsSupported: false,
  },
  worldtime: {
    id: "worldtime",
    name: "WorldTimeAPI",
    operator: "worldtimeapi.org",
    stratum: 1,
    region: "global",
    endpoint: "https://worldtimeapi.org/api/timezone/Etc/UTC",
    ntsSupported: false,
  },
  timeapi: {
    id: "timeapi",
    name: "TimeAPI.io",
    operator: "timeapi.io",
    stratum: 1,
    region: "global",
    endpoint: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
    ntsSupported: false,
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_CATALOG;
export const PROVIDER_IDS = Object.keys(PROVIDER_CATALOG) as ProviderId[];

const inputSchema = z.object({
  providers: z
    .array(z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]))
    .min(1)
    .max(5),
});

export type ProviderSample = {
  id: ProviderId;
  name: string;
  stratum: number;
  region: string;
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
 * Extract a millisecond timestamp from a provider's JSON body, preferring
 * `unixtime` > `dateTime` > `utc_datetime`. Returns `null` on missing or
 * malformed data so the caller falls back to the already-parsed Date header.
 */
async function extractMsFromJsonBody(res: Response, id: ProviderId): Promise<number | null> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    // Use nullish coalescing (?? / find) rather than `||` so a legitimate
    // numeric zero from `unixtime` is not discarded by falsy short-circuit
    // before Number.isFinite gets a chance to accept it.
    const unixtimeMs = typeof body.unixtime === "number" ? body.unixtime * 1000 : null;
    const dateTimeMs = typeof body.dateTime === "string" ? Date.parse(body.dateTime) : null;
    const utcMs = typeof body.utc_datetime === "string" ? Date.parse(body.utc_datetime) : null;
    const candidate = [unixtimeMs, dateTimeMs, utcMs].find(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    return candidate ?? null;
  } catch (err) {
    // Malformed JSON body — fall back to Date header (already parsed above).
    console.warn(`[time-sync] provider "${id}" returned unparseable JSON; using Date header`, err);
    return null;
  }
}

/**
 * Fetch the current authoritative time from a single stratum-1 provider.
 *
 * Extracts the best-precision timestamp available in the response, tried in
 * this order:
 *  1. Provider-specific JSON body (`unixtime`, `dateTime`, `utc_datetime`).
 *  2. Cloudflare `cdn-cgi/trace` `ts=<seconds.fraction>` line.
 *  3. HTTP `Date` header (second precision, always present).
 *
 * Applies SSRF hardening at call time: enforces `https://`, refuses
 * redirects, and aborts after 3.5 s. All error paths (timeout, DNS,
 * non-2xx, unparseable body, non-finite result) return `null` so the
 * caller can degrade to the next provider without a throw.
 *
 * @param id Provider identifier from {@link PROVIDER_CATALOG}.
 * @returns Unix ms timestamp of the authoritative "now", or `null` on any
 *   failure.
 */
async function readProviderTime(id: ProviderId): Promise<number | null> {
  const provider = PROVIDER_CATALOG[id];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    // SSRF defense-in-depth: enforce https:// at call time so a future
    // mis-edit of PROVIDER_CATALOG can't downgrade to http:// or a non-web
    // scheme, and refuse to follow redirects so a compromised provider can't
    // 302 us at an internal or attacker-controlled origin.
    const parsed = new URL(provider.endpoint);
    if (parsed.protocol !== "https:") {
      console.warn(`[time-sync] provider "${id}" rejected: non-https endpoint`);
      return null;
    }
    const res = await fetch(provider.endpoint, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
      headers: { accept: "text/plain, application/json" },
    });
    // Prefer the HTTP Date header — every response has one and it's second-precision.
    const dateHeader = res.headers.get("date");
    let ms = dateHeader ? Date.parse(dateHeader) : NaN;

    // For providers that expose a millisecond-precision body, prefer that.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const candidate = await extractMsFromJsonBody(res, id);
      if (candidate !== null) ms = candidate;
    } else if (id === "cloudflare") {
      // trace body is "key=value" lines including ts=<unix seconds with fraction>
      const text = await res.text();
      const match = text.match(/ts=([\d.]+)/);
      if (match) ms = Math.round(parseFloat(match[1]) * 1000);
    }
    return Number.isFinite(ms) ? ms : null;
  } catch (err) {
    // Network error, abort, or non-2xx handled upstream — probe fails, caller decides.
    console.warn(`[time-sync] probe of provider "${id}" failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a single stratum-1 provider and shape the result for the client.
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
    stratum: provider.stratum,
    region: provider.region,
    rttMs,
  } as const;
  return serverTimeMs === null
    ? { ...common, ok: false, error: "no_response" }
    : { ...common, ok: true, serverTimeMs };
}

/**
 * TanStack server function: probe the user-selected stratum-1 time providers
 * in parallel and return the best result.
 *
 * Runs on the edge so we can benefit from the datacenter's own NTS-disciplined
 * clock and expose the client's `CF-IPCountry` header for regional provider
 * suggestions. Cloudflare is preferred when reachable; otherwise the lowest-RTT
 * successful source wins.
 *
 * @param data.providers Up to 5 provider IDs to query in parallel.
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
      // Prefer Cloudflare (NTS, strict UTC, global anycast) whenever it responds
      // successfully; otherwise fall back to the lowest-RTT (least-uncertainty) sample.
      const cf = ok.find((s) => s.id === "cloudflare");
      const best = cf ?? (ok.length ? ok.reduce((a, b) => (a.rttMs <= b.rttMs ? a : b)) : null);

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
