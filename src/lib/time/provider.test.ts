import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROVIDER_IDS,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  isPlausibleProviderTimestamp,
  normalizeProviderIds,
  parsePersistedProviderPreferences,
  parseProviderTimestamp,
  selectBestProvider,
} from "./provider.ts";
import { initialSyncState } from "./state.ts";

test("exports only the remaining HTTPS providers", () => {
  assert.deepEqual(PROVIDER_IDS, ["timeNow", "clockNow"]);
  assert.deepEqual(Object.keys(PROVIDER_CATALOG), ["timeNow", "clockNow"]);
  assert.deepEqual(DEFAULT_PROVIDER_IDS, ["timeNow", "clockNow"]);
});

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
    { id: "timeNow" as const, rttMs: 30 },
  ];
  assert.equal(selectBestProvider(samples)?.id, "timeNow");
<<<<<<< HEAD
  assert.equal(
    selectBestProvider(samples.filter((sample) => sample.id !== "timeNow"))?.id,
    "clockNow",
  );
=======
  assert.equal(selectBestProvider(samples.filter((sample) => sample.id !== "timeNow"))?.id, "clockNow");
>>>>>>> origin/main
  assert.equal(selectBestProvider([]), null);
});

test("normalizes obsolete, duplicate, and malformed provider IDs", () => {
  assert.deepEqual(
<<<<<<< HEAD
    normalizeProviderIds([
      "cloudflare",
      "worldtime",
      "timeapiWorld",
      "worldtime",
      null,
      "clockNow",
    ]),
    ["clockNow"],
  );
});

test("defaults to the remaining providers when persistence is empty", () => {
  assert.deepEqual(initialSyncState.providers, DEFAULT_PROVIDER_IDS);
  assert.deepEqual(normalizeProviderIds([]), []);
});

test("retains the selected provider identity", () => {
  const clock = { id: "clockNow" as const, rttMs: 10 };
  assert.equal(selectBestProvider([clock]), clock);
});

test("ignores persisted measurements while preserving valid providers", () => {
  assert.deepEqual(
    parsePersistedProviderPreferences({
      providers: ["clockNow"],
      history: [{ offsetMs: 500 }],
      offsetMs: 500,
    }),
    ["clockNow"],
  );
  assert.deepEqual(parsePersistedProviderPreferences({ history: [] }), DEFAULT_PROVIDER_IDS);
});

test("prefers a sub-second ISO timestamp over integer Unix seconds", () => {
  assert.equal(
    parseProviderTimestamp({
      unixtime: 1_700_000_000,
      utc_datetime: "2023-11-14T22:13:20.875Z",
    }),
    1_700_000_000_875,
=======
    normalizeProviderIds(["cloudflare", "worldtime", "timeapiWorld", "worldtime", null, "clockNow"]),
    ["clockNow"],
>>>>>>> origin/main
  );
});

test("defaults to the remaining providers when persistence is empty", () => {
  assert.deepEqual(initialSyncState.providers, DEFAULT_PROVIDER_IDS);
  assert.deepEqual(normalizeProviderIds([]), []);
});
