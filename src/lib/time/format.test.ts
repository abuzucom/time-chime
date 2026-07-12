import test from "node:test";
import assert from "node:assert/strict";
import { driftSeverity } from "./format.ts";

test("driftSeverity uses the requested 20 ms and 50 ms bands", () => {
  assert.equal(driftSeverity(-60), "bad");
  assert.equal(driftSeverity(-50), "warn");
  assert.equal(driftSeverity(-20), "ok");
  assert.equal(driftSeverity(0), "ok");
  assert.equal(driftSeverity(20), "ok");
  assert.equal(driftSeverity(50), "warn");
  assert.equal(driftSeverity(60), "bad");
});