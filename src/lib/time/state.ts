import type { ProviderId, ProviderSample } from "@/lib/time.functions";
import { DEFAULT_PROVIDER_IDS } from "./provider.ts";

export type MeasurementStatus = "not_measured" | "measuring" | "available" | "unavailable";

/** Legacy sample shape retained for context compatibility. */
export type SyncSample = {
  offsetMs: number;
  rttMs: number;
  at: number;
  sources: ProviderSample[];
  inferredCountry: string | null;
};

export type TimeSyncState = {
  status: MeasurementStatus;
  offsetMs: number;
  rttMs: number;
  measuredAt: number | null;
  selectedReferenceId: ProviderId | null;
  selectedReferenceName: string | null;
  sources: ProviderSample[];
  inferredCountry: string | null;
  providers: ProviderId[];
  error: string | null;
  measuring: boolean;
  lastSyncAt: number | null;
  syncing: boolean;
  history: SyncSample[];
};

/** Kept for callers that import the previous history limit. */
export const HISTORY_MAX = 30;

export const initialSyncState: TimeSyncState = {
  status: "not_measured",
  offsetMs: 0,
  rttMs: 0,
  measuredAt: null,
  selectedReferenceId: null,
  selectedReferenceName: null,
  sources: [],
  inferredCountry: null,
  providers: [...DEFAULT_PROVIDER_IDS],
  error: null,
  measuring: false,
  lastSyncAt: null,
  syncing: false,
  history: [],
};
