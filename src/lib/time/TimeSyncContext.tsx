import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { syncTime, type ProviderId, type ProviderSample } from "@/lib/time.functions";
<<<<<<< HEAD
import { estimateReferenceOffset } from "./measurement.ts";
import { setAuthoritativeOffset } from "./now.ts";
import {
  DEFAULT_PROVIDER_IDS,
  normalizeProviderIds,
  parsePersistedProviderPreferences,
} from "./provider.ts";
import { initialSyncState, type SyncSample, type TimeSyncState } from "./state.ts";
=======
import { HISTORY_MAX, initialSyncState, type SyncSample, type TimeSyncState } from "./state.ts";
import { setAuthoritativeOffset } from "./now.ts";
import { DEFAULT_PROVIDER_IDS, normalizeProviderIds } from "./provider.ts";
>>>>>>> origin/main

type TimeSyncContextValue = TimeSyncState & {
  measure: (providers?: ProviderId[], options?: { force?: boolean }) => Promise<void>;
  resync: (providers?: ProviderId[], options?: { force?: boolean }) => Promise<void>;
  setProviders: (ids: ProviderId[]) => void;
};

const TimeSyncContext = createContext<TimeSyncContextValue | null>(null);
const STORAGE_KEY = "westminster.timeSync.v1";
const MEASUREMENT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_MEASUREMENT_INTERVAL_MS = 15 * 1000;
const MIN_FORCE_MEASUREMENT_INTERVAL_MS = 5 * 1000;
const MEASUREMENT_JITTER_RATIO = 0.2;
const SAMPLE_COUNT = 4;

type ProbeResponse = Awaited<ReturnType<typeof syncTime>>;
type MeasurementResult = { sample: SyncSample; response: ProbeResponse };

class NoNetworkReferenceError extends Error {
  constructor(readonly response: ProbeResponse) {
    super("No network time reference responded");
  }
}

/** Return a jittered delay to spread provider requests across clients. */
function nextMeasurementDelayMs(base = MEASUREMENT_INTERVAL_MS): number {
  const spread = base * MEASUREMENT_JITTER_RATIO;
  return base - spread + Math.random() * spread * 2;
}

/** Load only provider preferences; previous measurements are never restored. */
function loadProviderPreferences(): ProviderId[] {
  if (typeof window === "undefined") return [...DEFAULT_PROVIDER_IDS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PROVIDER_IDS];
    return parsePersistedProviderPreferences(JSON.parse(raw));
  } catch (error) {
    console.warn("[time-reference] failed to load provider preferences", error);
    return [...DEFAULT_PROVIDER_IDS];
  }
}

/** Persist provider preferences without retaining measurements or offsets. */
function persistProviderPreferences(providers: ProviderId[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providers }));
    return true;
  } catch (error) {
    console.warn("[time-reference] failed to persist provider preferences", error);
    return false;
  }
}

<<<<<<< HEAD
/** Collect one client-to-reference estimate. */
async function takeSingleMeasurement(providers: ProviderId[]): Promise<MeasurementResult> {
  const requestStartedMs = Date.now();
  const perfStarted = performance.now();
  const response = await syncTime({ data: { providers } });
  if (!response.sources.some((source) => source.ok)) {
    throw new NoNetworkReferenceError(response);
  }
  const elapsedMs = performance.now() - perfStarted;
  const responseReceivedMs = requestStartedMs + elapsedMs;
  const rttMs = Math.max(0, elapsedMs);
  const offsetMs = estimateReferenceOffset(
    response.bestServerUnixMs,
    requestStartedMs,
    responseReceivedMs,
  );
  return {
    sample: {
      offsetMs,
      rttMs,
      at: responseReceivedMs,
      sources: response.sources,
      inferredCountry: response.inferredCountry,
    },
    response,
=======
type ProbeResponse = Awaited<ReturnType<typeof syncTime>>;

class NoNetworkSampleError extends Error {
  constructor(readonly response: ProbeResponse) {
    super("No network time reference responded");
  }
}

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
  if (!response.sources.some((source) => source.ok)) {
    throw new NoNetworkSampleError(response);
  }
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
>>>>>>> origin/main
  };
}

/** Keep the lowest client-observed RTT from a short measurement burst. */
async function collectBestMeasurement(
  providers: ProviderId[],
<<<<<<< HEAD
): Promise<MeasurementResult | { failure: ProbeResponse } | null> {
  let best: MeasurementResult | null = null;
=======
  maxSamples = 4,
): Promise<
  | { best: SyncSample; lastResponse: ProbeResponse }
  | { failure: ProbeResponse }
  | null> {
  let best: SyncSample | null = null;
>>>>>>> origin/main
  let lastResponse: ProbeResponse | null = null;
  let lastError: unknown = null;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    try {
<<<<<<< HEAD
      const result = await takeSingleMeasurement(providers);
      lastResponse = result.response;
      if (!best || result.sample.rttMs < best.sample.rttMs) best = result;
    } catch (error) {
      if (error instanceof NoNetworkReferenceError) lastResponse = error.response;
      lastError = error;
      if (best) return best;
    }
  }
  if (best) return best;
=======
      const { sample, response } = await takeSingleSample(providers);
      lastResponse = response;
      if (!best || sample.rttMs < best.rttMs) best = sample;
    } catch (err) {
      if (err instanceof NoNetworkSampleError) lastResponse = err.response;
      lastError = err;
      // If we already have a good sample keep it; otherwise fall through and
      // let the caller see the failure once every attempt is exhausted.
      if (best) break;
    }
  }
  if (best && lastResponse) return { best, lastResponse };
>>>>>>> origin/main
  if (lastResponse) return { failure: lastResponse };
  if (lastError) throw lastError;
  return null;
}

/** Provide automatic reference measurements and app-only clock calibration. */
export function TimeSyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimeSyncState>(() => ({
    ...initialSyncState,
    status: "measuring",
    measuring: true,
    syncing: true,
    providers: loadProviderPreferences(),
  }));
  const inFlight = useRef(false);
  const providersRef = useRef(state.providers);
  const lastAttemptAt = useRef(0);
  const failureToastShown = useRef(false);
  const storageToastShown = useRef(false);
  providersRef.current = state.providers;

<<<<<<< HEAD
  const recordFailure = useCallback((error: unknown, sources: ProviderSample[] = []) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    setAuthoritativeOffset(0);
    setState((previous) => ({
      ...previous,
      status: "unavailable",
      offsetMs: 0,
      rttMs: 0,
      measuredAt: null,
      selectedReferenceId: null,
      selectedReferenceName: null,
      sources,
      inferredCountry: null,
      error: message,
      measuring: false,
      lastSyncAt: null,
      syncing: false,
      history: [],
    }));
    if (!failureToastShown.current) {
      failureToastShown.current = true;
      toast.error("Network reference unavailable", {
        description: "The app is using device time until a reference measurement succeeds.",
=======
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
  const handleSyncFailure = useCallback(
    (err: unknown, sources: ProviderSample[] = []) => {
    const message = err instanceof Error ? err.message : "unknown_error";
    lastAttemptAt.current = 0;
    setAuthoritativeOffset(0);
    setState((s) => ({
      ...s,
      offsetMs: 0,
      rttMs: 0,
      lastSyncAt: null,
      syncing: false,
      error: message,
      sources,
      inferredCountry: null,
    }));
    if (!syncFailed.current) {
      syncFailed.current = true;
      toast.error("Time sync unavailable", {
        description:
          "Every selected time reference failed to respond. Showing local device time until the next attempt.",
>>>>>>> origin/main
      });
    }
  }, []);

  const measure = useCallback(
    async (requestedProviders?: ProviderId[], options?: { force?: boolean }) => {
      const providers = requestedProviders
        ? normalizeProviderIds(requestedProviders)
        : providersRef.current;
      if (providers.length === 0 || inFlight.current) return;
      const sinceLastAttemptMs = Date.now() - lastAttemptAt.current;
      const minRequiredMs = options?.force
        ? MIN_FORCE_MEASUREMENT_INTERVAL_MS
        : MIN_MEASUREMENT_INTERVAL_MS;
      if (sinceLastAttemptMs < minRequiredMs) return;
      lastAttemptAt.current = Date.now();
      inFlight.current = true;
      setState((previous) => ({
        ...previous,
        status: "measuring",
        offsetMs: 0,
        rttMs: 0,
        measuredAt: null,
        selectedReferenceId: null,
        selectedReferenceName: null,
        sources: [],
        error: null,
        measuring: true,
        lastSyncAt: null,
        syncing: true,
        history: [],
      }));
      try {
        const result = await collectBestMeasurement(providers);
        if (!result) {
          recordFailure(new Error("No network reference measurement completed"));
          return;
        }
        if ("failure" in result) {
          recordFailure(new Error("No network time reference responded"), result.failure.sources);
          return;
        }
        const selectedReferenceId = result.response.selectedProviderId ?? null;
        const selectedReferenceName = result.response.selectedProviderName ?? null;
        if (!selectedReferenceId || !selectedReferenceName) {
          recordFailure(new Error("The selected network reference was not identified"));
          return;
        }
        setAuthoritativeOffset(result.sample.offsetMs);
        failureToastShown.current = false;
        setState((previous) => ({
          ...previous,
          status: "available",
          offsetMs: result.sample.offsetMs,
          rttMs: result.sample.rttMs,
          measuredAt: result.sample.at,
          selectedReferenceId,
          selectedReferenceName,
          sources: result.response.sources,
          inferredCountry: result.response.inferredCountry,
          error: null,
          measuring: false,
          lastSyncAt: result.sample.at,
          syncing: false,
          history: [],
        }));
      } catch (error) {
        recordFailure(error);
      } finally {
        inFlight.current = false;
      }
<<<<<<< HEAD
    },
    [recordFailure],
  );

  const setProviders = useCallback((ids: ProviderId[]) => {
    const normalized = normalizeProviderIds(ids);
    const providers = normalized.length ? normalized : [...DEFAULT_PROVIDER_IDS];
    providersRef.current = providers;
    setState((previous) => ({ ...previous, providers }));
    if (!persistProviderPreferences(providers) && !storageToastShown.current) {
      storageToastShown.current = true;
      toast.warning("Provider choice cannot be saved", {
        description: "Storage is unavailable, so this choice lasts only for this visit.",
      });
    }
=======
      if ("failure" in result) {
        handleSyncFailure(
          new Error("No network time reference responded"),
          result.failure.sources,
        );
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
    const nextProviders = normalizeProviderIds(ids);
    const resolvedProviders = nextProviders.length ? nextProviders : [...DEFAULT_PROVIDER_IDS];
    providersRef.current = resolvedProviders;
    setState((s) => {
      const next = { ...s, providers: resolvedProviders };
      persistTimeSyncState(next);
      return next;
    });
>>>>>>> origin/main
  }, []);
  useEffect(() => {
    persistProviderPreferences(providersRef.current);
    void measure();
    let timeoutId = window.setTimeout(function scheduleNextMeasurement() {
      void measure();
      timeoutId = window.setTimeout(scheduleNextMeasurement, nextMeasurementDelayMs());
    }, nextMeasurementDelayMs());
    const onVisible = () => {
      if (document.visibilityState === "visible") void measure();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [measure]);

  const value = useMemo<TimeSyncContextValue>(
    () => ({ ...state, measure, resync: measure, setProviders }),
    [state, measure, setProviders],
  );
  return <TimeSyncContext.Provider value={value}>{children}</TimeSyncContext.Provider>;
}

/** Read the current network reference measurement state. */
export function useTimeSync(): TimeSyncContextValue {
  const context = useContext(TimeSyncContext);
  if (!context) throw new Error("useTimeSync must be used inside TimeSyncProvider");
  return context;
}
