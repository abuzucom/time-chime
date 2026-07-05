import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { syncTime, type ProviderId } from "@/lib/time.functions";
import { HISTORY_MAX, initialSyncState, type SyncSample, type TimeSyncState } from "./state";
import { setAuthoritativeOffset } from "./now";

type TimeSyncContextValue = TimeSyncState & {
  resync: () => Promise<void>;
  setProviders: (ids: ProviderId[]) => void;
};

const TimeSyncContext = createContext<TimeSyncContextValue | null>(null);

const STORAGE_KEY = "westminster.timeSync.v1";
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;
/**
 * Hard floor between successful sync attempts, enforced regardless of caller.
 *
 * Protects the stratum-1 upstreams (and our own Worker budget) from being
 * hammered by background chime scheduling, visibility flapping, click-spam
 * on the manual "Sync now" button, or a runaway effect loop. Anything that
 * calls `resync()` — foreground UI, scheduler, background handoff, retry
 * timer — passes through this gate first.
 *
 * 15 s is short enough that a human tapping "Sync now" after a real network
 * change sees a fresh sample almost immediately, and long enough that a
 * scheduler wired to fire on every chime boundary (worst case ~1/minute
 * with quarter chimes) can never cause more than one probe per interval.
 */
const MIN_RESYNC_INTERVAL_MS = 15 * 1000;
/**
 * Random jitter (±) applied to the scheduled resync cadence.
 *
 * Without jitter, every tab that boots at the top of the hour would probe
 * again exactly 10 minutes later, creating a thundering-herd against the
 * stratum-1 upstreams. With ±20% jitter the next fire lands somewhere in
 * [8 min, 12 min], spreading load and making it much harder for an
 * observer to correlate probes across users.
 */
const RESYNC_JITTER_RATIO = 0.2;

/**
 * Return the next resync delay, uniformly sampled from
 * `[base * (1 - RESYNC_JITTER_RATIO), base * (1 + RESYNC_JITTER_RATIO)]`.
 * Extracted so it can be unit-tested and mocked.
 */
function nextResyncDelayMs(base = RESYNC_INTERVAL_MS): number {
  const spread = base * RESYNC_JITTER_RATIO;
  return base - spread + Math.random() * spread * 2;
}

/**
 * Read the previously persisted time-sync state (chosen providers plus recent
 * offset samples) from `localStorage`. Returns `null` on the server, when
 * nothing has been persisted, or when the stored payload cannot be parsed.
 */
function loadPersistedTimeSyncState(): Partial<TimeSyncState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TimeSyncState>;
  } catch (err) {
    console.warn("[time-sync] failed to load persisted sync state", err);
    return null;
  }
}

/**
 * Persist the chosen providers and the trailing offset history (capped at
 * {@link HISTORY_MAX} samples) to `localStorage`. Failures — quota exceeded,
 * privacy-mode blocks, disabled storage — are logged and swallowed.
 */
function persistTimeSyncState(state: TimeSyncState): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ providers: state.providers, history: state.history.slice(-HISTORY_MAX) }),
    );
    return true;
  } catch (err) {
    // Quota exceeded or storage disabled — best effort; surface for debugging.
    console.warn("[time-sync] failed to persist sync state", err);
    return false;
  }
}

type ProbeResponse = Awaited<ReturnType<typeof syncTime>>;

/**
 * Perform one NTP-style probe against the current provider list and compute
 * a symmetric-delay offset sample from the round-trip.
 *
 * Assumes wire latency is symmetric (i.e. `t2 ≈ t3` at the server), so the
 * corrected client midpoint of the exchange is `t1 + rtt/2 + serverProc/2`
 * and `offset = serverTime - midpoint`.
 *
 * Rethrows on network / server failure so the caller can decide whether to
 * abandon the round or fall back to a previously collected sample.
 */
async function takeSingleSample(providers: ProviderId[]): Promise<{
  sample: SyncSample;
  response: ProbeResponse;
}> {
  const t1 = Date.now();
  const response = await syncTime({ data: { providers } });
  const t4 = Date.now();
  const rttMs = Math.max(0, t4 - t1 - response.serverProcessingMs);
  const midpoint = t1 + rttMs / 2 + response.serverProcessingMs / 2;
  const offsetMs = response.bestServerUnixMs - midpoint;
  const sample: SyncSample = {
    offsetMs,
    rttMs,
    at: Date.now(),
    sources: response.sources,
    inferredCountry: response.inferredCountry,
  };
  return { sample, response };
}

/**
 * Run up to `maxSamples` NTP-style probes back-to-back and return the sample
 * with the lowest observed RTT (i.e. the most trustworthy offset). Returns
 * `null` only when every attempt failed; a partial success still wins.
 *
 * Rethrows the last error only if no sample was collected — the caller can
 * then decide whether to surface it to the user.
 */
async function collectBestProbe(
  providers: ProviderId[],
  maxSamples = 4,
): Promise<{ best: SyncSample; lastResponse: ProbeResponse } | null> {
  let best: SyncSample | null = null;
  let lastResponse: ProbeResponse | null = null;
  let lastError: unknown = null;
  for (let i = 0; i < maxSamples; i++) {
    try {
      const { sample, response } = await takeSingleSample(providers);
      lastResponse = response;
      if (!best || sample.rttMs < best.rttMs) best = sample;
    } catch (err) {
      lastError = err;
      // If we already have a good sample keep it; otherwise fall through and
      // let the caller see the failure once every attempt is exhausted.
      if (best) break;
    }
  }
  if (best && lastResponse) return { best, lastResponse };
  if (lastError) throw lastError;
  return null;
}

/**
 * React context provider for authoritative time synchronization.
 *
 * On mount (and on tab re-focus, and every {@link RESYNC_INTERVAL_MS}) runs
 * up to four NTP-style HTTPS probes against the user's configured stratum-1
 * providers, keeps the sample with the lowest RTT, writes the derived offset
 * into {@link setAuthoritativeOffset} so every clock face and scheduler picks
 * it up, and persists provider selection + offset history to `localStorage`.
 *
 * Exposes `resync()` for a manual refresh and `setProviders(ids)` for user
 * changes to the provider selection.
 */
export function TimeSyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimeSyncState>(() => {
    const persisted = loadPersistedTimeSyncState();
    return {
      ...initialSyncState,
      ...(persisted?.providers ? { providers: persisted.providers } : {}),
      history: persisted?.history ?? [],
    };
  });
  const inFlight = useRef(false);
  const providersRef = useRef(state.providers);
  providersRef.current = state.providers;
  const syncFailed = useRef(false);
  const persistWarned = useRef(false);
  /**
   * Timestamp of the last `resync()` invocation that made it past the
   * cooldown gate — successful or not. Compared against
   * {@link MIN_RESYNC_INTERVAL_MS} to decide whether to short-circuit the
   * next call. Tracking the *attempt* time (not the last success) means a
   * caller can't sidestep the gate by hammering while the network is down.
   */
  const lastAttemptAt = useRef(0);

  /**
   * Merge a newly collected NTP sample into the sync state, publish the
   * offset to the authoritative-time module, and persist history — showing
   * a one-shot toast if `localStorage` is unavailable. Kept as a reducer-style
   * function so it can run inside `setState` without racing other updates.
   */
  const reduceBestSampleIntoState = useCallback(
    (best: SyncSample, response: ProbeResponse) =>
      (previous: TimeSyncState): TimeSyncState => {
        const nextHistory = [...previous.history, best].slice(-HISTORY_MAX);
        const next: TimeSyncState = {
          ...previous,
          offsetMs: best.offsetMs,
          rttMs: best.rttMs,
          lastSyncAt: best.at,
          syncing: false,
          error: null,
          history: nextHistory,
          sources: response.sources,
          inferredCountry: response.inferredCountry,
        };
        if (!persistTimeSyncState(next) && !persistWarned.current) {
          persistWarned.current = true;
          toast.warning("Sync history can't be saved", {
            description:
              "Storage is unavailable, so provider choice and drift history won't persist.",
          });
        }
        return next;
      },
    [],
  );

  /**
   * Record an all-providers-failed sync attempt: flip the state into an
   * error condition and show a deduped toast so we don't spam the user
   * every RESYNC_INTERVAL_MS while offline.
   */
  const handleSyncFailure = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "unknown_error";
    setState((s) => ({ ...s, syncing: false, error: message }));
    if (!syncFailed.current) {
      syncFailed.current = true;
      toast.error("Time sync unavailable", {
        description:
          "Every stratum-1 provider failed to respond. Showing local device time until the next attempt.",
      });
    }
  }, []);

  const resync = useCallback(async () => {
    if (inFlight.current) return;
    // Cooldown gate: enforce a hard minimum interval between attempts so no
    // caller — background chime scheduler, visibility flapping, effect loop,
    // or click-spam on the manual "Sync now" button — can hammer the
    // stratum-1 upstreams. Silent no-op; UI state stays untouched so a
    // gated call doesn't flash "syncing…".
    const sinceLast = Date.now() - lastAttemptAt.current;
    if (sinceLast < MIN_RESYNC_INTERVAL_MS) return;
    lastAttemptAt.current = Date.now();
    inFlight.current = true;
    setState((s) => ({ ...s, syncing: true, error: null }));
    try {
      const result = await collectBestProbe(providersRef.current);
      if (!result) {
        setState((s) => ({ ...s, syncing: false }));
        return;
      }
      setAuthoritativeOffset(result.best.offsetMs);
      const recovered = syncFailed.current;
      syncFailed.current = false;
      setState(reduceBestSampleIntoState(result.best, result.lastResponse));
      if (recovered) toast.success("Time sync restored");
    } catch (err) {
      handleSyncFailure(err);
    } finally {
      inFlight.current = false;
    }
  }, [reduceBestSampleIntoState, handleSyncFailure]);


  const setProviders = useCallback((ids: ProviderId[]) => {
    setState((s) => {
      const next = { ...s, providers: ids };
      persistTimeSyncState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    void resync();
    // Self-scheduling timeout instead of a fixed setInterval: each tick picks
    // a fresh jittered delay so multiple tabs / devices that boot together
    // don't stay phase-locked and pile onto the upstreams at the same instant.
    let timeoutId = window.setTimeout(function scheduleNextResync() {
      void resync();
      timeoutId = window.setTimeout(scheduleNextResync, nextResyncDelayMs());
    }, nextResyncDelayMs());
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [resync]);

  const value = useMemo<TimeSyncContextValue>(
    () => ({ ...state, resync, setProviders }),
    [state, resync, setProviders],
  );

  return <TimeSyncContext.Provider value={value}>{children}</TimeSyncContext.Provider>;
}

/**
 * Access the current time-sync state (offset, RTT, history, sources, …)
 * plus `resync` and `setProviders` helpers.
 * @throws If called outside `<TimeSyncProvider>`.
 */
export function useTimeSync(): TimeSyncContextValue {
  const ctx = useContext(TimeSyncContext);
  if (!ctx) throw new Error("useTimeSync must be used inside <TimeSyncProvider>");
  return ctx;
}
