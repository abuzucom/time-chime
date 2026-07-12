// Shared verification logic for the HTTPS guard's proxy-header-derived
// redirect. Used by the fuzz suite (tests/https-guard-fuzz.test.mjs), the
// failure replayer (scripts/replay-fuzz-failure.mjs), and the failure
// reporter (scripts/report-fuzz-failure.mjs) — previously duplicated three
// times with three different return shapes.

import { enforceHttps, isSafeHost } from "../../src/lib/http/https-guard.ts";

/**
 * Materialise a fuzz/replay spec ({ url, method, headers }) into a Request.
 * Header values the fetch stack rejects (CR/LF/NUL) are silently dropped
 * one at a time rather than failing the whole Request — this mirrors
 * production (a real proxy forwards what it can) and lets a fuzz/shrink run
 * keep exploring instead of every malformed header being fatal. Returns
 * `null` if the base URL itself is unusable.
 */
export function specToRequest(spec) {
  const headers = new Headers();
  for (const [name, value] of spec.headers ?? []) {
    try {
      headers.append(name, value);
    } catch {
      /* platform-rejected header value; drop and keep going */
    }
  }
  try {
    return new Request(spec.url, { method: spec.method, headers });
  } catch {
    try {
      return new Request(spec.url, { method: spec.method });
    } catch {
      return null;
    }
  }
}

export function expectedPathForSpec(spec) {
  const u = new URL(spec.url);
  return u.pathname + u.search + u.hash;
}

// C0 control range is 0x00-0x1f; 0x7f (DEL) is also a control byte. Checked
// by char code rather than a \u-escape regex literal to avoid embedding raw
// control bytes in this source file.
const MAX_C0_CONTROL_CODE = 0x1f;
const DEL_CODE = 0x7f;

function findControlByte(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= MAX_C0_CONTROL_CODE || code === DEL_CODE) return code;
  }
  return null;
}

/**
 * Run a proxy-header spec through `enforceHttps` and validate every
 * invariant the guard is expected to uphold on any 301 it produces:
 * https-only scheme, no header-injection control bytes, a host that
 * independently passes `isSafeHost`, no leaked userinfo, and the original
 * path/query/hash preserved verbatim.
 *
 * Never throws. `ok` tells the caller whether the guard behaved correctly;
 * `detail` is always a human-readable summary; the remaining fields are
 * populated as far as evaluation got (e.g. `location`/`host` are absent on
 * an `unbuildable`/`threw`/`passthrough` outcome).
 */
export function verifyHttpsGuardRedirect(spec) {
  const request = specToRequest(spec);
  if (request === null) {
    return { ok: true, outcome: "unbuildable", detail: "unbuildable request (base URL unusable)" };
  }

  let response;
  try {
    response = enforceHttps(request);
  } catch (err) {
    return { ok: false, outcome: "threw", detail: `enforceHttps threw: ${err.message}` };
  }

  if (response === null) {
    return { ok: true, outcome: "passthrough", detail: "guard returned null (passthrough)" };
  }
  if (response.status === 403) {
    return { ok: true, outcome: "forbidden", status: 403, detail: "guard returned 403" };
  }
  if (response.status !== 301) {
    return {
      ok: false,
      outcome: "unexpected-status",
      status: response.status,
      detail: `unexpected status ${response.status}`,
    };
  }

  const location = response.headers.get("Location");
  if (!location) {
    return { ok: false, outcome: "redirect", status: 301, detail: "301 without Location header" };
  }

  const controlByteCode = findControlByte(location);
  if (controlByteCode !== null) {
    return {
      ok: false,
      outcome: "redirect",
      status: 301,
      location,
      detail: `Location contains control byte 0x${controlByteCode.toString(16)}: ${JSON.stringify(location)}`,
    };
  }

  return evaluateRedirectInvariants(spec, location);
}

/**
 * Parse a guard-produced Location and check the invariants a valid redirect
 * must uphold: https scheme, a host that independently passes `isSafeHost`,
 * no leaked userinfo, and the original path/query/hash preserved verbatim.
 */
function evaluateRedirectInvariants(spec, location) {
  let parsed;
  try {
    parsed = new URL(location);
  } catch (err) {
    return {
      ok: false,
      outcome: "redirect",
      status: 301,
      location,
      detail: `Location does not parse: ${err.message}`,
    };
  }

  const expectedPathAndBeyond = expectedPathForSpec(spec);
  const actualPathAndBeyond = parsed.pathname + parsed.search + parsed.hash;
  const hostSafe = isSafeHost(parsed.host);
  const userinfoLeaked = parsed.username !== "" || parsed.password !== "";
  const pathPreserved = actualPathAndBeyond === expectedPathAndBeyond;

  const base = {
    outcome: "redirect",
    status: 301,
    location,
    scheme: parsed.protocol,
    host: parsed.host,
    hostSafe,
    userinfoLeaked,
    expectedPathAndBeyond,
    actualPathAndBeyond,
    pathPreserved,
  };

  if (parsed.protocol !== "https:") {
    return { ok: false, ...base, detail: `Location scheme is not https: ${location}` };
  }
  if (!hostSafe) {
    return {
      ok: false,
      ...base,
      detail: `Location host failed isSafeHost: ${JSON.stringify(parsed.host)}`,
    };
  }
  if (userinfoLeaked) {
    return { ok: false, ...base, detail: `Location leaked userinfo: ${location}` };
  }
  if (!pathPreserved) {
    return {
      ok: false,
      ...base,
      detail: `Location path/query/hash changed: expected ${JSON.stringify(expectedPathAndBeyond)}, got ${JSON.stringify(actualPathAndBeyond)}`,
    };
  }

  return { ok: true, ...base, detail: `301 -> ${location}` };
}
