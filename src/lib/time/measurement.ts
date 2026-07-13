import type { MeasurementStatus } from "./state.ts";
import { formatRelative } from "./format.ts";

export type ReferencePresentationInput = {
  status: MeasurementStatus;
  now: number;
  offsetMs?: number;
  measuredAt?: number | null;
  selectedReferenceName?: string | null;
};

export type ReferencePresentation = {
  badgeLabel: string;
  offsetLabel: string;
  detail: string;
  ageLabel: string;
};

/** Project a provider timestamp to the end of server processing. */
export function projectProviderTimestamp(
  providerTimestampMs: number,
  receivedAtServerMs: number,
  serverEndMs: number,
): number {
  return providerTimestampMs + Math.max(0, serverEndMs - receivedAtServerMs);
}

/** Estimate provider offset against the midpoint of the client request. */
export function estimateReferenceOffset(
  projectedProviderTimestampMs: number,
  clientRequestStartedMs: number,
  clientResponseReceivedMs: number,
): number {
  const midpointMs =
    clientRequestStartedMs + (clientResponseReceivedMs - clientRequestStartedMs) / 2;
  return projectedProviderTimestampMs - midpointMs;
}

/** Format an estimated offset without implying certified precision. */
export function formatEstimatedOffset(offsetMs: number): string {
  const roundedMs = Math.round(Math.abs(offsetMs));
  const sign = offsetMs >= 0 ? "+" : "-";
  return `${sign}${roundedMs} ms`;
}

/** Convert measurement state into the exact claims shown by the UI. */
export function deriveReferencePresentation(
  input: ReferencePresentationInput,
): ReferencePresentation {
  if (input.status === "measuring") {
    return {
      badgeLabel: "Measuring network reference...",
      offsetLabel: "Measuring...",
      detail: "Waiting for a network reference measurement",
      ageLabel: "Measurement in progress",
    };
  }
  if (input.status === "unavailable") {
    return {
      badgeLabel: "No network reference available",
      offsetLabel: "No reference",
      detail: "The latest network reference measurement failed",
      ageLabel: "No successful measurement",
    };
  }
  if (
    input.status === "available" &&
    typeof input.offsetMs === "number" &&
    input.measuredAt &&
    input.selectedReferenceName
  ) {
    const offsetLabel = formatEstimatedOffset(input.offsetMs);
    const direction = input.offsetMs >= 0 ? "behind" : "ahead of";
    return {
      badgeLabel: `Estimated device offset ${offsetLabel}`,
      offsetLabel,
      detail: `device clock is ${direction} ${input.selectedReferenceName}`,
      ageLabel: `Last successful measurement ${formatRelative(input.measuredAt, input.now)}`,
    };
  }
  return {
    badgeLabel: "No reference measured",
    offsetLabel: "No reference",
    detail: "No network reference measurement has completed",
    ageLabel: "No successful measurement",
  };
}
