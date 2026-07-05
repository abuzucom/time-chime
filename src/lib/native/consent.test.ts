/**
 * Consent state-machine tests. Runs under `node --test` (same runner as
 * `tests/check-headers.test.mjs`) so we don't add a second test framework.
 *
 * Every assertion targets pure logic — we inject a fake NotificationAdapter
 * and an in-memory storage, so the tests never touch Capacitor, the DOM, or
 * the OS. That's intentional: the whole point of splitting the state
 * machine out of the React layer is to make these transitions cheap to
 * verify.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConsentController,
  initialSnapshot,
  type ConsentSnapshot,
  type ConsentStorage,
} from "./consent.ts";
import type { NotificationAdapter, PermissionOutcome } from "./notifications.ts";

/** In-memory ConsentStorage — no localStorage, no JSON. */
function memoryStorage(seed?: ConsentSnapshot): ConsentStorage {
  let value: ConsentSnapshot | null = seed ?? null;
  return {
    read: () => value,
    write: (snap) => {
      value = snap;
    },
    clear: () => {
      value = null;
    },
  };
}

/**
 * Build a fake adapter whose `checkPermission` / `requestPermission` return
 * a scripted sequence. Advancing past the end reuses the final answer, so
 * tests can assert "and every subsequent call keeps returning granted."
 */
function scriptedAdapter(script: {
  check?: PermissionOutcome[];
  request?: PermissionOutcome[];
}): NotificationAdapter {
  const check = [...(script.check ?? [])];
  const req = [...(script.request ?? [])];
  const pop = (arr: PermissionOutcome[], fallback: PermissionOutcome) =>
    arr.length > 1 ? (arr.shift() as PermissionOutcome) : arr[0] ?? fallback;
  return {
    checkPermission: async () => pop(check, "prompt"),
    requestPermission: async () => pop(req, "prompt"),
    schedule: async () => ({ ok: true }),
    cancelAll: async () => {},
    openSystemSettings: async () => {},
  };
}

test("initial state is not_asked with no persisted snapshot", () => {
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage: memoryStorage(),
    now: () => 1_000,
  });
  assert.equal(c.snapshot.state, "not_asked");
  assert.equal(c.snapshot.updatedAt, 0);
  assert.equal(c.snapshot.lastOsPermission, null);
});

test("hydrates from persisted snapshot", () => {
  const seed: ConsentSnapshot = {
    state: "granted",
    updatedAt: 500,
    lastOsPermission: "granted",
  };
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage: memoryStorage(seed),
  });
  assert.deepEqual(c.snapshot, seed);
});

test("openSheet moves not_asked → asking and persists", () => {
  const storage = memoryStorage();
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage,
    now: () => 42,
  });
  c.openSheet();
  assert.equal(c.snapshot.state, "asking");
  assert.equal(c.snapshot.updatedAt, 42);
  assert.equal(storage.read()?.state, "asking");
});

test("openSheet is a no-op when already granted", () => {
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage: memoryStorage({
      state: "granted",
      updatedAt: 1,
      lastOsPermission: "granted",
    }),
  });
  c.openSheet();
  assert.equal(c.snapshot.state, "granted");
});

test("grantFromSheet with OS granted → granted", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ request: ["granted"] }),
    storage: memoryStorage(),
  });
  c.openSheet();
  const snap = await c.grantFromSheet();
  assert.equal(snap.state, "granted");
  assert.equal(snap.lastOsPermission, "granted");
});

test("grantFromSheet with OS denied → denied_by_os", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ request: ["denied"] }),
    storage: memoryStorage(),
  });
  c.openSheet();
  const snap = await c.grantFromSheet();
  assert.equal(snap.state, "denied_by_os");
  assert.equal(snap.lastOsPermission, "denied");
});

test("grantFromSheet with OS prompt (dismissed) treated as denied_by_os", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ request: ["prompt"] }),
    storage: memoryStorage(),
  });
  c.openSheet();
  const snap = await c.grantFromSheet();
  assert.equal(snap.state, "denied_by_os");
});

test("declineFromSheet → declined_by_user, and openSheet re-opens it", () => {
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage: memoryStorage(),
  });
  c.openSheet();
  c.declineFromSheet();
  assert.equal(c.snapshot.state, "declined_by_user");
  c.openSheet();
  assert.equal(c.snapshot.state, "asking");
});

test("reconcileWithOs: granted → revoked when OS answer drifts to denied", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ check: ["denied"] }),
    storage: memoryStorage({
      state: "granted",
      updatedAt: 1,
      lastOsPermission: "granted",
    }),
  });
  const snap = await c.reconcileWithOs();
  assert.equal(snap.state, "revoked");
  assert.equal(snap.lastOsPermission, "denied");
});

test("reconcileWithOs: denied_by_os → granted when the user re-enables in Settings", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ check: ["granted"] }),
    storage: memoryStorage({
      state: "denied_by_os",
      updatedAt: 1,
      lastOsPermission: "denied",
    }),
  });
  const snap = await c.reconcileWithOs();
  assert.equal(snap.state, "granted");
});

test("reconcileWithOs: revoked → granted when the user re-enables", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ check: ["granted"] }),
    storage: memoryStorage({
      state: "revoked",
      updatedAt: 1,
      lastOsPermission: "denied",
    }),
  });
  const snap = await c.reconcileWithOs();
  assert.equal(snap.state, "granted");
});

test("reconcileWithOs: no transition keeps state but refreshes lastOsPermission", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ check: ["prompt"] }),
    storage: memoryStorage({
      state: "not_asked",
      updatedAt: 1,
      lastOsPermission: null,
    }),
  });
  const snap = await c.reconcileWithOs();
  assert.equal(snap.state, "not_asked");
  assert.equal(snap.lastOsPermission, "prompt");
});

test("reconcileWithOs: OS unavailable transitions to unavailable from any state", async () => {
  const c = createConsentController({
    adapter: scriptedAdapter({ check: ["unavailable"] }),
    storage: memoryStorage({
      state: "granted",
      updatedAt: 1,
      lastOsPermission: "granted",
    }),
  });
  const snap = await c.reconcileWithOs();
  assert.equal(snap.state, "unavailable");
});

test("subscribe fires on every commit and unsubscribe stops it", () => {
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage: memoryStorage(),
  });
  const events: string[] = [];
  const unsub = c.subscribe((s) => events.push(s.state));
  c.openSheet();
  c.declineFromSheet();
  unsub();
  c.openSheet(); // should not append
  assert.deepEqual(events, ["asking", "declined_by_user"]);
});

test("reset clears storage and returns to not_asked", () => {
  const storage = memoryStorage({
    state: "granted",
    updatedAt: 1,
    lastOsPermission: "granted",
  });
  const c = createConsentController({
    adapter: scriptedAdapter({}),
    storage,
    now: () => 99,
  });
  c.reset();
  assert.equal(c.snapshot.state, "not_asked");
  assert.equal(c.snapshot.updatedAt, 99);
  assert.equal(storage.read()?.state, "not_asked");
});

test("initialSnapshot helper is stable", () => {
  const a = initialSnapshot();
  const b = initialSnapshot();
  assert.deepEqual(a, b);
  assert.equal(a.state, "not_asked");
});
