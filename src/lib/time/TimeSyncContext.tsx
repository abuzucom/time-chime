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
import { estimateReferenceOffset } from "./measurement.ts";
import { setAuthoritativeOffset } from "./now.ts";
import {
  DEFAULT_PROVIDER_IDS,
  normalizeProviderIds,
  parsePersistedProviderPreferences,
} from "./provider.ts";
import { initialSyncState, type SyncSample, type TimeSyncState } from "./state.ts";

type TimeSyncContextValue = TimeSyncState & {
  measure: (providers?: ProviderId[], options?: { force?: boolean }) => Promise<void>;
  resync: (providers?: ProviderId[], options?: { force?: boolean }) => Promise<void>;
  setProviders: (ids: ProviderId[]) => void;
};

const TimeSyncContext = createContext<TimeSyncContextValue | null>(null);
const STORAGE_KEY = "westminster.timeSync.v1";
const MEASUREMENT_INTERVAL_MS = 10 * 60 * 1000;
// Matches the server-side minimum resync interval so hammering the button
// cannot flood upstream providers. Applies to forced (user-triggered)
// measurements too; keep in step with the server's syncTimeBurstLimiter.
const MIN_MEASUREMENT_INTERVAL_MS = 15 * 1000;
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
  };
}

/** Keep the lowest client-observed RTT from a short measurement burst. */
async function collectBestMeasurement(
  providers: ProviderId[],
): Promise<MeasurementResult | { failure: ProbeResponse } | null> {
  let best: MeasurementResult | null = null;
  let lastResponse: ProbeResponse | null = null;
  let lastError: unknown = null;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    try {
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
      });
    }
  }, []);

  const measure = useCallback(
    // `force` is accepted for caller compatibility but no longer shortens
    // the cooldown; every measurement honors MIN_MEASUREMENT_INTERVAL_MS.
    async (requestedProviders?: ProviderId[], _options?: { force?: boolean }) => {
      const providers = requestedProviders
        ? normalizeProviderIds(requestedProviders)
        : providersRef.current;
      if (providers.length === 0 || inFlight.current) return;
      const sinceLastAttemptMs = Date.now() - lastAttemptAt.current;
      if (sinceLastAttemptMs < MIN_MEASUREMENT_INTERVAL_MS) return;
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
