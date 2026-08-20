// Unit tests for scripts/check-persist-credentials.mjs.
//
// Run with:  node --test tests/check-persist-credentials.test.mjs
//
// Uses Node's built-in test runner and assert module, no dependencies. The
// checker is text and indent based rather than a YAML parse, so the cases
// below concentrate on block boundaries: a `persist-credentials: false` that
// belongs to a different step must never clear a bare checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "../scripts/check-persist-credentials.mjs";

const WORKFLOW = "wf.yml";

function lines(...rows) {
  return rows.join("\n");
}

test("findViolations: flags a checkout step with no persist-credentials", () => {
  const text = lines("jobs:", "  build:", "    steps:", "      - uses: actions/checkout@v4");
  const violations = findViolations(text, WORKFLOW);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^wf\.yml:4: /);
  assert.match(violations[0], /Rule 11/);
});

test("findViolations: accepts persist-credentials: false in the with block", () => {
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          persist-credentials: false",
  );
  assert.deepEqual(findViolations(text, WORKFLOW), []);
});

test("findViolations: accepts the exact Rule 11 exception comment", () => {
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      # persist-credentials: true: this job pushes the fix branch (Rule 11 exception).",
    "      - uses: actions/checkout@v4",
  );
  assert.deepEqual(findViolations(text, WORKFLOW), []);
});

test("findViolations: rejects a comment that does not match the exception form", () => {
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      # we need the credential here, honest",
    "      - uses: actions/checkout@v4",
  );
  assert.equal(findViolations(text, WORKFLOW).length, 1);
});

test("findViolations: a later step's persist-credentials does not clear an earlier one", () => {
  // The bare checkout is step one. Step two sets the flag. Scoping the search
  // to the owning step block is the whole point of the indent walk.
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          persist-credentials: false",
  );
  const violations = findViolations(text, WORKFLOW);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^wf\.yml:4: /, "only the first, bare step is flagged");
});

test("findViolations: reports every offending step in one file", () => {
  const text = lines(
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "  b:",
    "    steps:",
    "      - uses: actions/checkout@v4",
  );
  assert.equal(findViolations(text, WORKFLOW).length, 2);
});

test("findViolations: ignores uses: lines for other actions", () => {
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: oven-sh/setup-bun@v2",
    "      - uses: actions/setup-node@v6",
  );
  assert.deepEqual(findViolations(text, WORKFLOW), []);
});

test("findViolations: handles a SHA-pinned checkout with a trailing version comment", () => {
  const text = lines(
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
  );
  assert.equal(findViolations(text, WORKFLOW).length, 1);
});

test("findViolations: handles CRLF line endings", () => {
  const text = ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@v4"].join(
    "\r\n",
  );
  assert.equal(findViolations(text, WORKFLOW).length, 1);
});

test("findViolations: returns nothing for a workflow with no checkout step", () => {
  assert.deepEqual(findViolations(lines("name: x", "on: push"), WORKFLOW), []);
});
