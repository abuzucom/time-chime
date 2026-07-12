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
import { dirname, join, resolve, isAbsolute } from "node:path";
import { isSafeHost } from "../src/lib/http/https-guard.ts";
import { verifyHttpsGuardRedirect } from "./lib/verify-https-redirect.mjs";

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
  else if (a === "-h" || a === "--help") {
    printHelp();
    process.exit(0);
  } else if (a.startsWith("--")) {
    console.error(`Unknown flag: ${a}`);
    process.exit(2);
  } else explicitPaths.push(a);
}

function printHelp() {
  console.log(
    "Usage: node scripts/replay-fuzz-failure.mjs [<file.json>...] [--latest] [--delete-passing]\n" +
      "\n" +
      "Reproduces saved https-guard fuzz counterexamples deterministically.\n" +
      "With no arguments, replays every JSON in tests/__fuzz-failures__/.",
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
  try {
    targets = explicitPaths.map((p) => {
      // Check for path traversal attempts in the original input
      if (p.includes("..") || isAbsolute(p)) {
        throw new Error("Invalid path");
      }
      const resolved = resolve(p);
      return resolved;
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
} else if (latestOnly) {
  const all = listDir()
    .map((p) => ({ p, mtime: statSync(p).mtimeMs }))
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
// Replay logic - proxy-headers delegates to the shared invariant checker in
// scripts/lib/verify-https-redirect.mjs (also used by the fuzz suite and the
// failure reporter); safe-host stays local since it's a single boolean check.
// Both return a structured verdict instead of throwing.
// ---------------------------------------------------------------------------

function replayProxyHeaders(spec) {
  const result = verifyHttpsGuardRedirect(spec);
  // "unbuildable" and "threw" stay distinct from "fail": a saved failure spec
  // that was buildable at capture time but isn't now (or that crashes the
  // guard) is itself worth investigating, not silently counted as a pass.
  if (result.outcome === "unbuildable") return { status: "unbuildable", detail: result.detail };
  if (result.outcome === "threw") return { status: "threw", detail: result.detail };
  return { status: result.ok ? "pass" : "fail", detail: result.detail };
}

function replaySafeHost(spec) {
  const candidate = spec.candidate;
  let accepted;
  try {
    accepted = isSafeHost(candidate);
  } catch (err) {
    return { status: "threw", detail: err.message };
  }
  // A saved safe-host failure means isSafeHost accepted something it shouldn't.
  // If it now rejects the candidate, the bug is fixed → "pass".
  return accepted
    ? { status: "fail", detail: `isSafeHost still accepts ${JSON.stringify(candidate)}` }
    : { status: "pass", detail: `isSafeHost rejects ${JSON.stringify(candidate)}` };
}

function replay(payload) {
  if (payload.kind === "proxy-headers") return replayProxyHeaders(payload.spec);
  if (payload.kind === "safe-host") return replaySafeHost(payload.spec);
  return { status: "unknown", detail: `unknown kind "${payload.kind}"` };
}

// ---------------------------------------------------------------------------
// Walk targets
// ---------------------------------------------------------------------------

let stillFailing = 0;
let nowPassing = 0;
let errored = 0;

for (const path of targets) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
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
      try {
        unlinkSync(path);
        console.log(`    (deleted)`);
      } catch (err) {
        console.error(`    (delete failed: ${err.message})`);
      }
    }
  } else {
    errored++;
    console.error(`? ${verdict.status.toUpperCase()}  ${path}\n    ${label} ${verdict.detail}`);
  }
}

console.log(
  `\nReplayed ${targets.length} spec(s): ` +
    `${stillFailing} still failing, ${nowPassing} now passing, ${errored} error(s).`,
);

// Exit non-zero only when a saved failure has silently gone green without a
// corresponding --delete-passing sweep. That is the signal the developer
// asked for: "the fix landed, prune the corpus."
if (nowPassing > 0 && !deletePassing) process.exit(1);
if (errored > 0) process.exit(2);
process.exit(0);
