/** Fixed HTTPS JSON services used as network time references. */
export const PROVIDER_CATALOG = {
  timeNow: {
    id: "timeNow",
    name: "Time.now",
    endpoint: "https://time.now/developer/api/timezone/UTC",
  },
  clockNow: {
    id: "clockNow",
    name: "Clock.now",
    endpoint: "https://clock.now/api/time/now",
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_CATALOG;
export const PROVIDER_IDS = Object.keys(PROVIDER_CATALOG) as ProviderId[];
export const DEFAULT_PROVIDER_IDS = [...PROVIDER_IDS] as ProviderId[];

/** Keep persisted and caller-supplied provider IDs within the current catalog. */
export function normalizeProviderIds(ids: readonly unknown[]): ProviderId[] {
  return Array.from(new Set(ids)).filter(
    (id): id is ProviderId => typeof id === "string" && PROVIDER_IDS.includes(id as ProviderId),
  );
}

/** Read provider preferences without restoring previous measurements. */
export function parsePersistedProviderPreferences(value: unknown): ProviderId[] {
  if (!value || typeof value !== "object") return [...DEFAULT_PROVIDER_IDS];
  const providers = (value as { providers?: unknown }).providers;
  const normalized = Array.isArray(providers) ? normalizeProviderIds(providers) : [];
  return normalized.length ? normalized : [...DEFAULT_PROVIDER_IDS];
}

const MAX_REFERENCE_SKEW_MS = 24 * 60 * 60 * 1000;
const ISO_FIELDS = ["utc_datetime", "datetime", "date", "iso", "utc"] as const;

/** Parse a documented provider response into Unix milliseconds. */
export function parseProviderTimestamp(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const unixSeconds =
    typeof record.unixtime === "number"
      ? record.unixtime
      : typeof record.timestamp === "number"
        ? record.timestamp
        : null;
  const unixMs = unixSeconds === null ? null : unixSeconds * 1000;
  const isoMs = ISO_FIELDS.map((field) =>
    typeof record[field] === "string" ? Date.parse(record[field]) : null,
  ).find((value): value is number => typeof value === "number" && Number.isFinite(value));
  const candidate = [isoMs, unixMs].find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return candidate ?? null;
}

/** Reject values that are not plausible current network reference timestamps. */
export function isPlausibleProviderTimestamp(timestampMs: number, nowMs = Date.now()): boolean {
  return Number.isFinite(timestampMs) && Math.abs(timestampMs - nowMs) <= MAX_REFERENCE_SKEW_MS;
}

/** Select the preferred reference, then the successful lowest-RTT sample. */
export function selectBestProvider<
  T extends {
    id: ProviderId;
    rttMs: number;
  },
>(samples: T[]): T | null {
  const preferred = samples.find((sample) => sample.id === "timeNow");
  return (
    preferred ?? (samples.length ? samples.reduce((a, b) => (a.rttMs <= b.rttMs ? a : b)) : null)
  );
}
