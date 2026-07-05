#!/usr/bin/env node
// Generate a human-readable markdown report from a saved https-guard fuzz
// failure JSON (see tests/https-guard-fuzz.test.mjs → saveFailure).
//
// Usage:
//   node scripts/report-fuzz-failure.mjs [path-to-failure.json] [--out report.md]
//
// With no argument, picks the newest JSON in tests/__fuzz-failures__/.
// With --out, writes the markdown to that file; otherwise prints to stdout.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { enforceHttps, isSafeHost } from "../src/lib/http/https-guard.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAILURES_DIR = resolve(HERE, "..", "tests", "__fuzz-failures__");

// ---------------------------------------------------------------------------
// CLI parsing (tiny, no deps).
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let inputPath = null;
let outPath = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out" || a === "-o") outPath = args[++i];
  else if (a === "--help" || a === "-h") { printHelpAndExit(); }
  else if (!inputPath) inputPath = a;
}
if (!inputPath) inputPath = findNewestFailure();
if (!inputPath) {
  console.error(`No failure JSON found in ${FAILURES_DIR}. Pass a path explicitly.`);
  process.exit(1);
}

function printHelpAndExit() {
  console.log("Usage: node scripts/report-fuzz-failure.mjs [path-to-failure.json] [--out report.md]");
  process.exit(0);
}

function findNewestFailure() {
  if (!existsSync(FAILURES_DIR)) return null;
  const entries = readdirSync(FAILURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = join(FAILURES_DIR, f);
      return { p, mtime: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0]?.p ?? null;
}

// ---------------------------------------------------------------------------
// Load and validate.
// ---------------------------------------------------------------------------

const raw = readFileSync(inputPath, "utf8");
const payload = JSON.parse(raw);
const { kind, seed, iteration, shrinkSteps, failure, spec } = payload;

// ---------------------------------------------------------------------------
// Reproduce actual guard behaviour so the report shows real observed output,
// not just the frozen assertion message.
// ---------------------------------------------------------------------------

const reproduction = reproduce(kind, spec);

function reproduce(kind, spec) {
  if (kind === "proxy-headers") return reproduceProxyHeaders(spec);
  if (kind === "safe-host")     return reproduceSafeHost(spec);
  return { note: `Unknown failure kind "${kind}" — cannot reproduce.` };
}

function reproduceProxyHeaders(spec) {
  let request;
  try {
    request = new Request(spec.url, { method: spec.method, headers: spec.headers });
  } catch (err) {
    return { note: `Could not rebuild Request: ${err.message}` };
  }
  let response;
  try {
    response = enforceHttps(request);
  } catch (err) {
    return { threw: err.message };
  }
  if (response === null) return { passthrough: true };
  const location = response.headers.get("Location");
  let parsed = null, parseError = null;
  if (location) {
    try { parsed = new URL(location); } catch (err) { parseError = err.message; }
  }
  const expected = (() => {
    const u = new URL(spec.url);
    return u.pathname + u.search + u.hash;
  })();
  const actualPath = parsed ? parsed.pathname + parsed.search + parsed.hash : null;
  return {
    status: response.status,
    location,
    parseError,
    scheme: parsed?.protocol ?? null,
    host: parsed?.host ?? null,
    hostSafe: parsed ? isSafeHost(parsed.host) : null,
    userinfoLeaked: parsed ? (parsed.username !== "" || parsed.password !== "") : null,
    expectedPathAndBeyond: expected,
    actualPathAndBeyond: actualPath,
    pathPreserved: actualPath === expected,
  };
}

function reproduceSafeHost(spec) {
  const candidate = spec.candidate;
  let accepted;
  try { accepted = isSafeHost(candidate); } catch (err) { return { threw: err.message }; }
  return { candidate, accepted };
}

// ---------------------------------------------------------------------------
// Markdown assembly.
// ---------------------------------------------------------------------------

const md = renderMarkdown();
if (outPath) {
  writeFileSync(outPath, md);
  console.error(`Wrote ${outPath}`);
} else {
  process.stdout.write(md);
}

function renderMarkdown() {
  const lines = [];
  lines.push(`# HTTPS Guard Fuzz — Minimised Counterexample`);
  lines.push(``);
  lines.push(`- **Source file:** \`${inputPath}\``);
  lines.push(`- **Kind:** \`${kind}\``);
  lines.push(`- **Seed:** \`${seed}\` (reproduce with \`HTTPS_GUARD_FUZZ_SEED=${seed}\`)`);
  lines.push(`- **First failing iteration:** ${iteration}`);
  lines.push(`- **Shrink steps applied:** ${shrinkSteps}`);
  lines.push(``);
  lines.push(`## Failure message`);
  lines.push(``);
  lines.push("```");
  lines.push(String(failure));
  lines.push("```");
  lines.push(``);

  if (kind === "proxy-headers") {
    lines.push(...renderProxySection());
  } else if (kind === "safe-host") {
    lines.push(...renderSafeHostSection());
  } else {
    lines.push(`## Spec`);
    lines.push("```json");
    lines.push(JSON.stringify(spec, null, 2));
    lines.push("```");
  }

  lines.push(``);
  lines.push(`## Replay`);
  lines.push(``);
  lines.push("```bash");
  lines.push(`HTTPS_GUARD_FUZZ_SEED=${seed} npm run test:https-guard-fuzz`);
  lines.push("```");
  lines.push(``);
  return lines.join("\n");
}

function renderProxySection() {
  const out = [];
  out.push(`## Minimised request`);
  out.push(``);
  out.push(`| Field | Value |`);
  out.push(`| --- | --- |`);
  out.push(`| Method | \`${spec.method}\` |`);
  out.push(`| URL | \`${spec.url}\` |`);
  out.push(``);
  out.push(`### Headers`);
  out.push(``);
  const headers = spec.headers ?? {};
  const keys = Object.keys(headers);
  if (keys.length === 0) {
    out.push(`_(none)_`);
  } else {
    out.push(`| Name | Value (JSON-escaped) |`);
    out.push(`| --- | --- |`);
    for (const k of keys) out.push(`| \`${k}\` | \`${escapeCell(JSON.stringify(headers[k]))}\` |`);
  }
  out.push(``);

  out.push(`## Expected vs. actual`);
  out.push(``);
  const r = reproduction;
  if (r.note) {
    out.push(`> ${r.note}`);
    return out;
  }
  if (r.threw) {
    out.push(`| | Expected | Actual |`);
    out.push(`| --- | --- | --- |`);
    out.push(`| Behaviour | Return a 301 or 403 without throwing | \`enforceHttps\` threw: \`${escapeCell(r.threw)}\` |`);
    return out;
  }
  if (r.passthrough) {
    out.push(`Guard returned \`null\` (pass-through). Failure predates the redirect branch.`);
    return out;
  }
  out.push(`| Property | Expected | Actual |`);
  out.push(`| --- | --- | --- |`);
  out.push(`| Status | \`301\` | \`${r.status}\` |`);
  out.push(`| Location present | yes | ${r.location === null ? "**no**" : "yes"} |`);
  out.push(`| Location (raw) | _(safe https URL)_ | \`${escapeCell(JSON.stringify(r.location))}\` |`);
  out.push(`| URL parses | yes | ${r.parseError ? `**no** — ${r.parseError}` : "yes"} |`);
  out.push(`| Scheme | \`https:\` | \`${r.scheme ?? "n/a"}\` |`);
  out.push(`| Host | _(passes \`isSafeHost\`)_ | \`${escapeCell(String(r.host))}\` |`);
  out.push(`| Host safe | \`true\` | \`${r.hostSafe}\` |`);
  out.push(`| Userinfo leaked | \`false\` | \`${r.userinfoLeaked}\` |`);
  out.push(`| Path/query/hash | \`${escapeCell(r.expectedPathAndBeyond)}\` | \`${escapeCell(String(r.actualPathAndBeyond))}\` |`);
  out.push(`| Path preserved | \`true\` | \`${r.pathPreserved}\` |`);
  return out;
}

function renderSafeHostSection() {
  const out = [];
  out.push(`## Minimised host candidate`);
  out.push(``);
  out.push("```");
  out.push(JSON.stringify(spec.candidate));
  out.push("```");
  out.push(``);
  out.push(`## Expected vs. actual`);
  out.push(``);
  const r = reproduction;
  if (r.threw) {
    out.push(`\`isSafeHost\` threw: \`${escapeCell(r.threw)}\``);
    return out;
  }
  out.push(`| | Expected | Actual |`);
  out.push(`| --- | --- | --- |`);
  out.push(`| \`isSafeHost\` verdict | \`false\` (candidate is unsafe) | \`${r.accepted}\` |`);
  out.push(``);
  out.push(`The fuzz suite considers this candidate unsafe because of the invariant`);
  out.push(`checks in \`checkHost\` — see the failure message above for which one tripped.`);
  return out;
}

function escapeCell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
