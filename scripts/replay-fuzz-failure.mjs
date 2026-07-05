#!/usr/bin/env node
// Deterministic replay for saved https-guard fuzz counterexamples.
//
// Usage:
//   node scripts/replay-fuzz-failure.mjs                 # replay every JSON in tests/__fuzz-failures__/
//   node scripts/replay-fuzz-failure.mjs <file.json>     # replay one
//   node scripts/replay-fuzz-failure.mjs --latest        # replay only the newest saved failure
//   node scripts/replay-fuzz-failure.mjs --delete-passing  # remove JSONs that no longer reproduce
//
// Exit codes:
//   0 — every replayed spec still fails (i.e. the bug is unfixed OR the
//        directory is empty; check the printed summary)
//   1 — at least one saved failure no longer reproduces (spec passes now)
//   2 — usage / IO error
//
// The point: paste a JSON path from a CI artifact and re-run the same guard
// code path locally with zero randomness, then use --delete-passing after a
// fix lands to prune saved cases the new code handles.

import { readFileSync, readdirSync, statSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { enforceHttps, isSafeHost } from "../src/lib/http/https-guard.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAILURES_DIR = resolve(HERE, "..", "tests", "__fuzz-failures__");

// ---------------------------------------------------------------------------
// CLI parse
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let latestOnly = false;
let deletePassing = false;
let explicitPaths = [];
for (const a of argv) {
  if (a === "--latest") latestOnly = true;
  else if (a === "--delete-passing") deletePassing = true;
  else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
  else if (a.startsWith("--")) { console.error(`Unknown flag: ${a}`); process.exit(2); }
  else explicitPaths.push(a);
}

function printHelp() {
  console.log(
    "Usage: node scripts/replay-fuzz-failure.mjs [<file.json>...] [--latest] [--delete-passing]\n" +
    "\n" +
    "Reproduces saved https-guard fuzz counterexamples deterministically.\n" +
    "With no arguments, replays every JSON in tests/__fuzz-failures__/."
  );
}

// ---------------------------------------------------------------------------
// Resolve target set
// ---------------------------------------------------------------------------

function listDir() {
  if (!existsSync(FAILURES_DIR)) return [];
  return readdirSync(FAILURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(FAILURES_DIR, f));
}

let targets;
if (explicitPaths.length > 0) {
  targets = explicitPaths.map((p) => resolve(p));
} else if (latestOnly) {
  const all = listDir().map((p) => ({ p, mtime: statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  targets = all.length ? [all[0].p] : [];
} else {
  targets = listDir().sort();
}

if (targets.length === 0) {
  console.log(`No saved failures in ${FAILURES_DIR}. Nothing to replay.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Replay logic — mirrors checkSpec / checkHost in tests/https-guard-fuzz.test.mjs
// but returns a structured verdict instead of throwing.
// ---------------------------------------------------------------------------

function replayProxyHeaders(spec) {
  let request;
  try {
    request = new Request(spec.url, { method: spec.method, headers: spec.headers });
  } catch (err) {
    return { status: "unbuildable", detail: err.message };
  }
  let response;
  try {
    response = enforceHttps(request);
  } catch (err) {
    return { status: "threw", detail: err.message };
  }
  if (response === null || response.status === 403) {
    return { status: "pass", detail: `guard returned ${response === null ? "null (passthrough)" : "403"}` };
  }
  if (response.status !== 301) {
    return { status: "fail", detail: `unexpected status ${response.status}` };
  }
  const location = response.headers.get("Location");
  if (!location) return { status: "fail", detail: "301 without Location" };
  const badByte = location.match(/[\u0000-\u001f\u007f]/);
  if (badByte) return { status: "fail", detail: `Location has control byte 0x${badByte[0].charCodeAt(0).toString(16)}: ${JSON.stringify(location)}` };
  let parsed;
  try { parsed = new URL(location); } catch (err) { return { status: "fail", detail: `Location does not parse: ${err.message}` }; }
  if (parsed.protocol !== "https:") return { status: "fail", detail: `Location scheme ${parsed.protocol} in ${location}` };
  if (!isSafeHost(parsed.host)) return { status: "fail", detail: `Location host failed isSafeHost: ${JSON.stringify(parsed.host)}` };
  if (parsed.username || parsed.password) return { status: "fail", detail: `Location leaked userinfo: ${location}` };
  const expected = (() => { const u = new URL(spec.url); return u.pathname + u.search + u.hash; })();
  const actual = parsed.pathname + parsed.search + parsed.hash;
  if (actual !== expected) return { status: "fail", detail: `path/query/hash changed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` };
  return { status: "pass", detail: `301 → ${location}` };
}

function replaySafeHost(spec) {
  const candidate = spec.candidate;
  let accepted;
  try { accepted = isSafeHost(candidate); } catch (err) { return { status: "threw", detail: err.message }; }
  // A saved safe-host failure means isSafeHost accepted something it shouldn't.
  // If it now rejects the candidate, the bug is fixed → "pass".
  return accepted
    ? { status: "fail", detail: `isSafeHost still accepts ${JSON.stringify(candidate)}` }
    : { status: "pass", detail: `isSafeHost rejects ${JSON.stringify(candidate)}` };
}

function replay(payload) {
  if (payload.kind === "proxy-headers") return replayProxyHeaders(payload.spec);
  if (payload.kind === "safe-host")     return replaySafeHost(payload.spec);
  return { status: "unknown", detail: `unknown kind "${payload.kind}"` };
}

// ---------------------------------------------------------------------------
// Walk targets
// ---------------------------------------------------------------------------

let stillFailing = 0;
let nowPassing   = 0;
let errored      = 0;

for (const path of targets) {
  let payload;
  try { payload = JSON.parse(readFileSync(path, "utf8")); }
  catch (err) {
    console.error(`✖ ${path} — cannot parse: ${err.message}`);
    errored++;
    continue;
  }
  const verdict = replay(payload);
  const label = `[${payload.kind} seed=${payload.seed} iter=${payload.iteration}]`;
  if (verdict.status === "fail") {
    stillFailing++;
    console.log(`✖ STILL FAILS   ${path}\n    ${label} ${verdict.detail}`);
  } else if (verdict.status === "pass") {
    nowPassing++;
    console.log(`✓ now passes    ${path}\n    ${label} ${verdict.detail}`);
    if (deletePassing) {
      try { unlinkSync(path); console.log(`    (deleted)`); }
      catch (err) { console.error(`    (delete failed: ${err.message})`); }
    }
  } else {
    errored++;
    console.error(`? ${verdict.status.toUpperCase()}  ${path}\n    ${label} ${verdict.detail}`);
  }
}

console.log(
  `\nReplayed ${targets.length} spec(s): ` +
  `${stillFailing} still failing, ${nowPassing} now passing, ${errored} error(s).`
);

// Exit non-zero only when a saved failure has silently gone green without a
// corresponding --delete-passing sweep. That is the signal the developer
// asked for: "the fix landed, prune the corpus."
if (nowPassing > 0 && !deletePassing) process.exit(1);
if (errored > 0) process.exit(2);
process.exit(0);
