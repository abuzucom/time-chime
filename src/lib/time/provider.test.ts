import test from "node:test";
import assert from "node:assert/strict";
import {
  isPlausibleProviderTimestamp,
  parseProviderTimestamp,
  selectBestProvider,
} from "./provider.ts";

test("parses Unix seconds from the JSON providers", () => {
  assert.equal(parseProviderTimestamp({ unixtime: 1_700_000_000 }), 1_700_000_000_000);
});

test("falls back to documented ISO UTC fields", () => {
  assert.equal(
    parseProviderTimestamp({ utc_datetime: "2026-07-12T12:00:00.000Z" }),
    Date.parse("2026-07-12T12:00:00.000Z"),
  );
});

test("rejects malformed and non-object responses", () => {
  assert.equal(parseProviderTimestamp(null), null);
  assert.equal(parseProviderTimestamp({ unixtime: Number.NaN }), null);
  assert.equal(parseProviderTimestamp({ message: "not time" }), null);
});

test("rejects timestamps outside the plausibility window", () => {
  const now = 1_700_000_000_000;
  assert.equal(isPlausibleProviderTimestamp(now, now), true);
  assert.equal(isPlausibleProviderTimestamp(now + 24 * 60 * 60 * 1000 + 1, now), false);
});

test("prefers Time.now, then chooses the lowest RTT", () => {
  const samples = [
    { id: "clockNow" as const, rttMs: 10 },
    { id: "worldtime" as const, rttMs: 5 },
    { id: "timeNow" as const, rttMs: 30 },
  ];
  assert.equal(selectBestProvider(samples)?.id, "timeNow");
  assert.equal(
    selectBestProvider(samples.filter((sample) => sample.id !== "timeNow"))?.id,
    "worldtime",
  );
  assert.equal(selectBestProvider([]), null);
});
