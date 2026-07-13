import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveReferencePresentation,
  estimateReferenceOffset,
  projectProviderTimestamp,
} from "./measurement.ts";

test("presents all reference measurement states without sync or accuracy claims", () => {
  const now = 1_700_000_010_000;

  assert.deepEqual(deriveReferencePresentation({ status: "not_measured", now }), {
    badgeLabel: "No reference measured",
    offsetLabel: "No reference",
    detail: "No network reference measurement has completed",
    ageLabel: "No successful measurement",
  });
  assert.deepEqual(deriveReferencePresentation({ status: "measuring", now }), {
    badgeLabel: "Measuring network reference...",
    offsetLabel: "Measuring...",
    detail: "Waiting for a network reference measurement",
    ageLabel: "Measurement in progress",
  });
  assert.deepEqual(
    deriveReferencePresentation({
      status: "available",
      now,
      offsetMs: -32,
      measuredAt: now - 10_000,
      selectedReferenceName: "Time.now",
    }),
    {
      badgeLabel: "Estimated device offset -32 ms",
      offsetLabel: "-32 ms",
      detail: "device clock is ahead of Time.now",
      ageLabel: "Last successful measurement 10s ago",
    },
  );
  assert.deepEqual(deriveReferencePresentation({ status: "unavailable", now }), {
    badgeLabel: "No network reference available",
    offsetLabel: "No reference",
    detail: "The latest network reference measurement failed",
    ageLabel: "No successful measurement",
  });
});

test("projects a provider timestamp and estimates offset at the client midpoint", () => {
  assert.equal(projectProviderTimestamp(10_000, 10_040, 10_100), 10_060);
  assert.equal(estimateReferenceOffset(10_060, 9_900, 10_100), 60);
});
