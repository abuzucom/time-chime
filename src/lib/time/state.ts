import type { ProviderId, ProviderSample } from "@/lib/time.functions";

/**
 * One completed NTP-style probe against the user's chosen provider set.
 *
 * Stored in the rolling `history` array so the drift panel can render the
 * trend line and the current provider distribution.
 */
export type SyncSample = {
  /** Signed clock skew: `authoritative − device` in milliseconds. */
  offsetMs: number;
  /** Best-case round-trip time (ms) across the providers that answered. */
  rttMs: number;
  /** `Date.now()` on the device at the moment the sample was completed. */
  at: number;
  /** Per-provider results contributing to this sample. */
  sources: ProviderSample[];
  /** Country inferred from the fastest responder, or `null` when unknown. */
  inferredCountry: string | null;
};

/**
 * Full reducer state held by `TimeSyncProvider`. Persisted (partially) to
 * `localStorage` so the app can boot with a warm offset and the user's
 * previously selected providers.
 */
export type TimeSyncState = {
  /** Currently active offset applied to `Date.now()` for authoritative time. */
  offsetMs: number;
  /** RTT associated with the currently active offset. */
  rttMs: number;
  /** Device timestamp of the last successful sync, or `null` if never synced. */
  lastSyncAt: number | null;
  /** `true` while a probe is in flight (drives the badge spinner). */
  syncing: boolean;
  /** Human-readable message from the most recent failed probe, else `null`. */
  error: string | null;
  /** Rolling window of the last {@link HISTORY_MAX} samples, newest last. */
  history: SyncSample[];
  /** Providers contributing to the current offset (mirrors newest sample). */
  sources: ProviderSample[];
  /** Country inferred from the current sample, or `null` when unknown. */
  inferredCountry: string | null;
  /** User-selected provider IDs, in priority order. */
  providers: ProviderId[];
};

/** Maximum number of {@link SyncSample}s retained in the rolling history. */
export const HISTORY_MAX = 30;

export const initialSyncState: TimeSyncState = {
  offsetMs: 0,
  rttMs: 0,
  lastSyncAt: null,
  syncing: false,
  error: null,
  history: [],
  sources: [],
  inferredCountry: null,
  providers: ["timeNow", "worldtime", "timeapiWorld", "clockNow"],
};
