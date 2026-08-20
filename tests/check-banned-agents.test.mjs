// Unit tests for scripts/check-banned-agents.mjs.
//
// Run with:  node --test tests/check-banned-agents.test.mjs
//
// The checker matches structured authorship fields only. Free-form commit
// bodies are deliberately out of scope: "grok" is an ordinary English verb
// and would false-positive constantly there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "../scripts/check-banned-agents.mjs";

function commit(overrides = {}) {
  return {
    sha: "0123456789abcdef",
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    committerName: "Ada Lovelace",
    committerEmail: "ada@example.com",
    body: "feat: add a thing",
    ...overrides,
  };
}

test("findViolations: a clean commit yields nothing", () => {
  assert.deepEqual(findViolations([commit()]), []);
});

test("findViolations: flags a banned author name", () => {
  const violations = findViolations([commit({ authorName: "Grok" })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /banned-agent author/);
  assert.match(violations[0], /^0123456789ab: /, "sha is abbreviated to 12 chars");
});

test("findViolations: flags a banned committer name", () => {
  const violations = findViolations([commit({ committerName: "grok code" })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /banned-agent committer/);
});

test("findViolations: flags a banned email domain", () => {
  const violations = findViolations([commit({ authorEmail: "bot@x.ai" })]);
  assert.equal(violations.length, 1);
});

test("findViolations: flags a banned email local part", () => {
  assert.equal(findViolations([commit({ authorEmail: "grok@example.com" })]).length, 1);
});

test("findViolations: flags a banned Co-authored-by trailer", () => {
  const body = "feat: add a thing\n\nCo-authored-by: Grok <grok@x.ai>";
  const violations = findViolations([commit({ body })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /banned-agent co-author/);
});

test("findViolations: ignores the word grok in free-form body text", () => {
  const body = "fix: make the parser easier to grok\n\nI finally grok this code.";
  assert.deepEqual(findViolations([commit({ body })]), []);
});

test("findViolations: does not match a word merely containing grok", () => {
  assert.deepEqual(findViolations([commit({ authorName: "Grokking Systems" })]), []);
});

test("findViolations: flags the xai vendor name", () => {
  assert.equal(findViolations([commit({ authorName: "xAI Bot" })]).length, 1);
});

test("findViolations: flags a banned pull request author login", () => {
  const violations = findViolations([commit()], "grok-bot");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /PR author/);
});

test("findViolations: accepts an ordinary pull request author login", () => {
  assert.deepEqual(findViolations([commit()], "octocat"), []);
});

test("findViolations: reports author and committer separately on one commit", () => {
  const violations = findViolations([commit({ authorName: "Grok", committerName: "Grok" })]);
  assert.equal(violations.length, 2);
});

test("findViolations: handles an empty commit range", () => {
  assert.deepEqual(findViolations([]), []);
});
