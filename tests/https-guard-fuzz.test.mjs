// Property-based / fuzz suite for the HTTPS redirect guard.
//
// The guard's job is to take an arbitrary inbound request that arrived over
// plaintext and produce a *safe* `Location:` for the browser to follow. The
// interesting attack surface is the tangle of proxy headers we consult to
// figure out what the client originally typed:
//
//   - RFC 7239 `Forwarded: for=…;proto=…;host=…`
//   - `X-Forwarded-Proto`, `X-Forwarded-Host`
//   - Cloudflare's `CF-Visitor: {"scheme":"…"}`
//   - The raw `Host` header
//
// Any of those can be attacker-controlled if a request slips past the edge, so
// we fuzz millions of malformed / adversarial combinations and assert two
// invariants on every produced redirect:
//
//   INVARIANT 1 — Scheme upgrade only.
//     The Location URL parses cleanly and its scheme is `https:`. No exotic
//     scheme (`javascript:`, `data:`, `file:`) ever appears.
//
//   INVARIANT 2 — No header-injection primitives in the emitted Location.
//     The raw Location string contains no CR, LF, NUL, or other C0 controls
//     — those are the bytes that turn a redirect into response-splitting.
//
//   INVARIANT 3 — The chosen host is one we consider "safe".
//     Either it equals the request URL's own host (safe fallback), or it
//     passes `isSafeHost`. It is never a value we would otherwise reject.
//
//   INVARIANT 4 — Path/query/hash are preserved verbatim from the request.
//     A fuzzed guard that silently drops the query string is a different
//     bug, but one worth catching here.
//
// Non-goals: we do NOT fuzz the 403 branch — for unsafe methods the guard
// returns a fixed text body with no user-controlled content, so there is
// nothing meaningful to fuzz.
//
// Determinism: the RNG is seeded so a failure is reproducible. Set
// `HTTPS_GUARD_FUZZ_SEED=<n>` to reproduce a specific run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { enforceHttps, isSafeHost } from "../src/lib/http/https-guard.ts";
import { specToRequest, verifyHttpsGuardRedirect } from "../scripts/lib/verify-https-redirect.mjs";

const FAILURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fuzz-failures__");

// ---------------------------------------------------------------------------
// Deterministic PRNG (xorshift32) — good enough for structural fuzzing and
// keeps the suite hermetic (no reliance on Math.random ordering).
// ---------------------------------------------------------------------------

const SEED = Number(process.env.HTTPS_GUARD_FUZZ_SEED ?? 0xc10cc0de);
let rngState = SEED >>> 0 || 1;
function rand() {
  // xorshift32
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return (rngState >>> 0) / 0x100000000;
}
function randInt(max) {
  return Math.floor(rand() * max);
}
function pick(xs) {
  return xs[randInt(xs.length)];
}
function chance(p) {
  return rand() < p;
}

// ---------------------------------------------------------------------------
// Fuzz alphabets. Each entry is a candidate byte/token the header assembler
// may splice in. The interesting ones are deliberately unsafe.
// ---------------------------------------------------------------------------

const HOST_TOKENS = [
  // Benign shapes we should still round-trip.
  "example.com",
  "sub.example.com",
  "localhost",
  "127.0.0.1",
  "[::1]",
  "[2001:db8::1]",
  "example.com:443",
  "example.com:8080",
  // Adversarial payloads. If any of these ever end up in Location, we fail.
  "evil.com\r\nSet-Cookie: pwn=1",
  "evil.com\nLocation: https://attacker",
  "evil.com\r",
  "evil.com\n",
  "evil.com\u0000null",
  "user:pass@evil.com",
  "evil.com/path",
  "evil.com?q=1",
  "evil.com#frag",
  "evil.com\\bad",
  "//evil.com",
  "evil.com%0d%0aX: y",
  "javascript:alert(1)",
  "data:text/html,evil",
  "..evil.com",
  ".",
  "",
  " ",
  "evil.com:99999",
  "evil.com:-1",
  "[::1", // unbalanced bracket
  "exämple.com",
  "evil.com\u200bhomograph",
  "a".repeat(300), // over length ceiling
];

const SCHEME_TOKENS = [
  "http",
  "https",
  "HTTP",
  "HTTPS",
  "https ",
  " http",
  "https\r\n",
  "https,http",
  "http,https",
  "wss",
  "ftp",
  "javascript",
  "",
  "https;boundary",
  'https"quoted',
  "http\u0000",
  "on",
  "off",
];

const CF_VISITOR_TOKENS = [
  `{"scheme":"http"}`,
  `{"scheme":"https"}`,
  `{"scheme":"HTTP"}`,
  `{"scheme":"javascript"}`,
  `{"scheme":123}`,
  `{"scheme":"http\r\n"}`,
  `{`,
  `null`,
  `"not-an-object"`,
  `{"scheme":"http","extra":"\r\nX-Injected: 1"}`,
  ``,
];

const URL_PATHS = [
  "/",
  "/a",
  "/a/b",
  "/index.html",
  "/search?q=hello",
  "/x?a=1&b=2#frag",
  "/%20space",
  "/unicode/ö",
  "/deep/nested/path/segment",
  "/?empty",
  "/#justhash",
];

const HOSTS_FOR_URL = ["example.com", "worker.dev", "app.local", "127.0.0.1:8080"];

const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

// ---------------------------------------------------------------------------
// Fuzz "specs".
//
// A spec is a fully serialisable description of a fuzz input:
//
//   { url: string, method: string, headers: Array<[name, value]> }
//
// We build Requests FROM specs (rather than mutating Request objects
// directly) for two reasons:
//   1. The shrinker (below) can freely delete/replace fields and
//      re-materialise a Request without losing information.
//   2. A failing spec is trivially JSON-serialisable, so we write it to
//      disk verbatim for later replay.
//
// Header order is preserved because RFC 7239 parsing and duplicate-header
// handling are order-sensitive.
// ---------------------------------------------------------------------------

function buildFuzzSpec() {
  const host = pick(HOSTS_FOR_URL);
  const path = pick(URL_PATHS);
  const url = `http://${host}${path}`;
  const headers = [];

  // Simulate arriving through Cloudflare most of the time — that's the
  // codepath that actually consults proxy headers. 20% of runs skip cf-ray
  // to verify the guard ignores proxy headers when the origin isn't trusted.
  if (chance(0.8)) headers.push(["cf-ray", "fuzz-ray-id"]);
  if (chance(0.7)) headers.push(["x-forwarded-proto", pick(SCHEME_TOKENS)]);
  if (chance(0.4)) headers.push(["cf-visitor", pick(CF_VISITOR_TOKENS)]);

  if (chance(0.6)) {
    const parts = [];
    if (chance(0.7)) parts.push(`proto=${pick(SCHEME_TOKENS)}`);
    if (chance(0.7)) {
      const h = pick(HOST_TOKENS);
      parts.push(chance(0.5) ? `host="${h}"` : `host=${h}`);
    }
    if (parts.length > 0) headers.push(["forwarded", parts.join(";")]);
  }

  if (chance(0.6)) headers.push(["x-forwarded-host", pick(HOST_TOKENS)]);
  if (chance(0.8)) headers.push(["host", pick(HOST_TOKENS)]);

  return { url, method: pick(METHODS), headers };
}

// The core invariants, applied to every 301 the guard produces, live in
// scripts/lib/verify-https-redirect.mjs (verifyHttpsGuardRedirect) - shared
// with the failure replayer and reporter so the three do not drift.

// ---------------------------------------------------------------------------
// Checker: returns the failure message string, or null when the input passes.
//
// Split out from the test body so both the initial fuzz sweep AND the
// shrinker can drive the same invariant logic. Never throws — turns
// assertion failures into strings so the shrinker can compare outcomes
// without unwinding the stack.
// ---------------------------------------------------------------------------

function checkSpec(spec) {
  const result = verifyHttpsGuardRedirect(spec);
  return result.ok ? null : result.detail;
}

// ---------------------------------------------------------------------------
// Shrinker.
//
// Delta-debugging in the classic Zeller/Hildebrandt style: try progressively
// smaller variants of a failing spec, keep any variant that still fails,
// repeat until a fixed point. The reductions cover every dimension the
// fuzzer varies:
//
//   - Delete a header entirely.
//   - Simplify the URL path to "/".
//   - Reset the method to "GET".
//   - Trim a header value's length (bisection).
//   - Strip a header value down to the smallest substring that still
//     triggers — helps isolate a single injected byte in a long payload.
//   - Replace a header value with a canonical benign form.
//
// A bounded step budget keeps a pathological failure from stalling CI.
// ---------------------------------------------------------------------------

const SHRINK_BUDGET = Number(process.env.HTTPS_GUARD_FUZZ_SHRINK_STEPS ?? 2000);

function shrinkSpec(spec, originalFailure) {
  let current = spec;
  let currentFailure = originalFailure;
  let steps = 0;
  let progress = true;

  const tryCandidate = (candidate) => {
    if (steps++ >= SHRINK_BUDGET) return false;
    const failure = checkSpec(candidate);
    if (failure !== null) {
      current = candidate;
      currentFailure = failure;
      return true;
    }
    return false;
  };

  while (progress && steps < SHRINK_BUDGET) {
    progress = false;

    // 1. Try deleting each header.
    for (let i = 0; i < current.headers.length; i++) {
      const reduced = { ...current, headers: current.headers.filter((_, j) => j !== i) };
      if (tryCandidate(reduced)) {
        progress = true;
        break;
      }
    }
    if (progress) continue;

    // 2. Try simplifying URL path.
    const parsed = new URL(current.url);
    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
      const simpler = `${parsed.protocol}//${parsed.host}/`;
      if (tryCandidate({ ...current, url: simpler })) {
        progress = true;
        continue;
      }
    }

    // 3. Try neutralising method.
    if (current.method !== "GET") {
      if (tryCandidate({ ...current, method: "GET" })) {
        progress = true;
        continue;
      }
    }

    // 4. Per-header value reductions.
    for (let i = 0; i < current.headers.length; i++) {
      const [name, value] = current.headers[i];
      if (tryBenignReduction(tryCandidate, current, i, name, value)) {
        progress = true;
        break;
      }
      if (tryBisectReduction(tryCandidate, current, i, name, value)) {
        progress = true;
        break;
      }
    }
  }

  return { spec: current, failure: currentFailure, steps };
}

/** Shrink step 4a: replace a header value with its benign canonical form. */
function tryBenignReduction(tryCandidate, current, i, name, value) {
  const benign = benignFor(name);
  if (benign === null || benign === value) return false;
  const reduced = {
    ...current,
    headers: current.headers.map((h, j) => (j === i ? [name, benign] : h)),
  };
  return tryCandidate(reduced);
}

/** Shrink step 4b: bisect a header value's length, halving from either end. */
function tryBisectReduction(tryCandidate, current, i, name, value) {
  if (value.length <= 1) return false;
  const half = Math.floor(value.length / 2);
  for (const shorter of [
    value.slice(0, half),
    value.slice(half),
    value.slice(1),
    value.slice(0, -1),
  ]) {
    if (shorter === value) continue;
    const reduced = {
      ...current,
      headers: current.headers.map((h, j) => (j === i ? [name, shorter] : h)),
    };
    if (tryCandidate(reduced)) return true;
  }
  return false;
}

/** Canonical benign values for common headers — endpoints of the shrink. */
function benignFor(name) {
  switch (name.toLowerCase()) {
    case "cf-ray":
      return "benign";
    case "x-forwarded-proto":
      return "http";
    case "cf-visitor":
      return `{"scheme":"http"}`;
    case "forwarded":
      return "proto=http";
    case "x-forwarded-host":
      return "example.com";
    case "host":
      return "example.com";
    default:
      return null;
  }
}

/** Persist a minimised failure spec for offline replay. */
function saveFailure(kind, spec, failure, steps, iteration) {
  try {
    mkdirSync(FAILURES_DIR, { recursive: true });
  } catch {
    /* already exists */
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(FAILURES_DIR, `${kind}-${stamp}-seed${SEED}.json`);
  const payload = { kind, seed: SEED, iteration, shrinkSteps: steps, failure, spec };
  try {
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return path;
  } catch (err) {
    return `<failed to write: ${err.message}>`;
  }
}

// ---------------------------------------------------------------------------
// The fuzz test itself. One `test()` node with N iterations — a per-run
// test node would swamp the reporter and hide the summary.
// ---------------------------------------------------------------------------

const ITERATIONS = Number(process.env.HTTPS_GUARD_FUZZ_ITERS ?? 3000);

test(`fuzz: ${ITERATIONS} random proxy-header combinations → safe Location`, () => {
  let redirects = 0;
  let nulls = 0;
  let forbiddens = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const spec = buildFuzzSpec();
    const failure = checkSpec(spec);

    if (failure !== null) {
      // Shrink FIRST, then report the minimised counterexample.
      const { spec: minSpec, failure: minFailure, steps } = shrinkSpec(spec, failure);
      const savedAt = saveFailure("proxy-headers", minSpec, minFailure, steps, i);
      assert.fail(
        `Fuzz failure at iteration ${i} (seed ${SEED}).\n` +
          `  Original failure: ${failure}\n` +
          `  Minimised after ${steps} shrink steps: ${minFailure}\n` +
          `  Minimised spec: ${JSON.stringify(minSpec)}\n` +
          `  Saved to: ${savedAt}\n` +
          `  Reproduce with: HTTPS_GUARD_FUZZ_SEED=${SEED} node --test tests/https-guard-fuzz.test.mjs`,
      );
    }

    // Bookkeeping — re-materialise to classify the outcome for the summary.
    const request = specToRequest(spec);
    const response = request ? enforceHttps(request) : null;
    if (response === null) nulls++;
    else if (response.status === 403) forbiddens++;
    else redirects++;
  }

  // Sanity floor — if the RNG somehow degenerated into "always null",
  // the invariants above would trivially hold and hide regressions.
  assert.ok(
    redirects > ITERATIONS * 0.1,
    `expected >10% redirects to exercise the Location codepath, got ${redirects}/${ITERATIONS}`,
  );

  // Emit a compact summary to stdout so CI logs show fuzz coverage.
  console.log(
    `  fuzz summary: ${redirects} redirects, ${forbiddens} forbiddens, ${nulls} pass-throughs (seed=${SEED})`,
  );
});

// ---------------------------------------------------------------------------
// Direct property test for `isSafeHost`: every accepted host must survive a
// URL round-trip with zero authority-slot escape, no matter what random
// bytes we throw at it.
// ---------------------------------------------------------------------------

/** Check a single host candidate; returns failure message or null. */
function checkHost(candidate) {
  if (!isSafeHost(candidate)) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(candidate))
    return `accepted host has control/whitespace: ${JSON.stringify(candidate)}`;
  if (/[\\/?#@%]/.test(candidate))
    return `accepted host has delimiter: ${JSON.stringify(candidate)}`;
  let probe;
  try {
    probe = new URL(`https://${candidate}/`);
  } catch (err) {
    return `URL construction failed for accepted host ${JSON.stringify(candidate)}: ${err.message}`;
  }
  if (probe.pathname !== "/")
    return `pathname leaked: ${probe.pathname} from ${JSON.stringify(candidate)}`;
  if (probe.username !== "" || probe.password !== "")
    return `userinfo leaked from ${JSON.stringify(candidate)}`;
  if (probe.search !== "" || probe.hash !== "")
    return `search/hash leaked from ${JSON.stringify(candidate)}`;
  return null;
}

/** Character-level shrinker for a failing host candidate. */
function shrinkHost(candidate, originalFailure) {
  let current = candidate;
  let currentFailure = originalFailure;
  let steps = 0;
  let progress = true;

  while (progress && steps < SHRINK_BUDGET) {
    progress = false;
    // Try deleting each character in turn.
    for (let i = 0; i < current.length; i++) {
      if (steps++ >= SHRINK_BUDGET) break;
      const reduced = current.slice(0, i) + current.slice(i + 1);
      const failure = checkHost(reduced);
      if (failure !== null) {
        current = reduced;
        currentFailure = failure;
        progress = true;
        break;
      }
    }
  }
  return { candidate: current, failure: currentFailure, steps };
}

test(`fuzz: ${ITERATIONS} random hosts — isSafeHost never accepts an escape primitive`, () => {
  let accepted = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    // 70% structured mutation of a HOST_TOKENS entry, 30% raw random bytes.
    let candidate;
    if (chance(0.7)) {
      candidate = mutate(pick(HOST_TOKENS));
    } else {
      const len = randInt(30);
      const bytes = new Array(len).fill(0).map(() => String.fromCharCode(randInt(128)));
      candidate = bytes.join("");
    }

    const failure = checkHost(candidate);
    if (failure !== null) {
      const {
        candidate: minCandidate,
        failure: minFailure,
        steps,
      } = shrinkHost(candidate, failure);
      const savedAt = saveFailure("safe-host", { candidate: minCandidate }, minFailure, steps, i);
      assert.fail(
        `Fuzz failure at iteration ${i} (seed ${SEED}).\n` +
          `  Original candidate: ${JSON.stringify(candidate)}\n` +
          `  Original failure: ${failure}\n` +
          `  Minimised after ${steps} shrink steps: ${JSON.stringify(minCandidate)}\n` +
          `  Minimised failure: ${minFailure}\n` +
          `  Saved to: ${savedAt}`,
      );
    }
    if (isSafeHost(candidate)) accepted++;
  }
  // We expect at least some accepts — otherwise the fuzzer isn't exercising
  // the positive branch and the round-trip assertions above are dead weight.
  assert.ok(
    accepted > 0,
    `no host was ever accepted across ${ITERATIONS} candidates (seed ${SEED})`,
  );
});

/** Small structural mutator: splice adversarial bytes into a seed token. */
function mutate(seed) {
  const ops = randInt(3) + 1;
  let s = seed;
  for (let i = 0; i < ops; i++) {
    const op = randInt(5);
    if (op === 0 && s.length > 0) {
      // Insert a random byte.
      const at = randInt(s.length + 1);
      const b = String.fromCharCode(randInt(128));
      s = s.slice(0, at) + b + s.slice(at);
    } else if (op === 1) {
      // Append a CRLF-ish payload.
      s = s + pick(["\r\n", "\r", "\n", "\u0000", "%0d%0a"]);
    } else if (op === 2) {
      // Prepend userinfo.
      s = "user:pass@" + s;
    } else if (op === 3) {
      // Wrap in brackets.
      s = "[" + s + "]";
    } else {
      // Uppercase / lowercase toggle.
      s = chance(0.5) ? s.toUpperCase() : s.toLowerCase();
    }
  }
  return s;
}
