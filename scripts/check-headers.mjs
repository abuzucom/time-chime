#!/usr/bin/env node
/**
 * Validates that critical HTTP response headers declared in public/_headers
 * are actually being served by a running deployment.
 *
 * Usage:
 *   node scripts/check-headers.mjs [baseUrl]
 *   BASE_URL=https://example.com node scripts/check-headers.mjs
 *
 * Exits 0 when every required header matches, non-zero otherwise.
 * Intended for CI (see .github/workflows/security-headers.yml) but also
 * usable locally against `vite preview` or a published URL.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEADERS_FILE = resolve(__dirname, "../public/_headers");

// True when this file was invoked as `node scripts/check-headers.mjs`, false
// when imported by the unit-test suite. Guards the main() side-effects so the
// module is safe to `import`.
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:4173").replace(
  /\/$/,
  "",
);

// -- Parse public/_headers -------------------------------------------------
// The file format (Cloudflare Pages / Netlify) is:
//   /path-pattern
//     Header-Name: value
//     Header-Name: value
//   /other
//     ...
// Blank lines and lines starting with `#` are ignored.
function parseHeadersFile(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      current = { pattern: line.trim(), headers: [] };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    current.headers.push({ name, value });
  }
  return groups;
}

/**
 * Normalise a header value for order-insensitive comparison against the
 * expected value declared in `public/_headers`.
 *
 * `Permissions-Policy` is compared as a **set of directives**: directives are
 * split on `,`, trimmed, de-duplicated, and re-sorted, so a proxy that
 * re-orders or double-appends directives does not cause a CI false-positive.
 * All other headers collapse runs of whitespace and are compared as strings.
 */
function normalise(name, value) {
  const n = name.toLowerCase();
  if (n === "permissions-policy") {
    // Set semantics: order-insensitive AND duplicate-insensitive. Intermediaries
    // have been observed to double-append directives; a duplicate on the wire
    // must not turn a valid policy into a CI failure.
    return [
      ...new Set(
        value
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
      ),
    ]
      .sort()
      .join(", ");
  }
  return value.replace(/\s+/g, " ").trim();
}

function pathForPattern(pattern) {
  // Map _headers patterns to a concrete probe URL.
  if (pattern === "/*") return "/";
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    // Pick a representative file we know exists in the built site.
    if (base === "/assets") return null; // asset filenames are hashed; skip probing
    if (base === "/.well-known") return "/.well-known/security.txt";
    return base + "/";
  }
  // Any other wildcard pattern (e.g. /*.html, /workbox-*.js) has no single
  // concrete URL to request — content-hashed or purely pattern-based rules
  // can't be probed generically against an arbitrary baseUrl (local build
  // or a live remote deployment both lack a fixed filename to try).
  if (pattern.includes("*")) return null;
  return pattern;
}

// -- HTTP probe ------------------------------------------------------------
async function fetchHeaders(url) {
  const res = await fetch(url, { redirect: "manual", method: "GET" });
  return { status: res.status, headers: res.headers };
}

// Compare one header group against the actual response headers. Returns a
// summary that is easy to assert against in unit tests and easy for main() to
// log/aggregate.
export function compareGroup(group, actualHeaders) {
  const results = [];
  for (const { name, value } of group.headers) {
    const got = actualHeaders.get(name);
    if (got === null || got === undefined) {
      results.push({ name, expected: value, got: null, ok: false, reason: "missing" });
      continue;
    }
    const ok = normalise(name, got) === normalise(name, value);
    results.push({ name, expected: value, got, ok, reason: ok ? "match" : "mismatch" });
  }
  return results;
}

// Exports for unit tests (see tests/check-headers.test.mjs). Kept as a named
// export block at module scope so import cost stays zero for the CLI path.
export { parseHeadersFile, normalise, pathForPattern, fetchHeaders };

// -- Main ------------------------------------------------------------------
async function main() {
  const spec = parseHeadersFile(readFileSync(HEADERS_FILE, "utf8"));
  console.log(`Validating headers against ${baseUrl}`);
  console.log(`Loaded ${spec.length} header groups from public/_headers\n`);

  let failures = 0;
  let checked = 0;

  for (const group of spec) {
    const path = pathForPattern(group.pattern);
    if (!path) {
      console.log(`↷ ${group.pattern} — skipped (no concrete filename to probe)\n`);
      continue;
    }
    const url = baseUrl + path;
    let actual;
    try {
      actual = await fetchHeaders(url);
    } catch (err) {
      console.error(`✗ ${group.pattern} — request to ${url} failed: ${err.message}`);
      failures += group.headers.length;
      continue;
    }
    if (actual.status >= 400) {
      console.error(`✗ ${group.pattern} — ${url} returned HTTP ${actual.status}`);
      failures += group.headers.length;
      continue;
    }
    console.log(`→ ${group.pattern}  (${url}, HTTP ${actual.status})`);
    for (const result of compareGroup(group, actual.headers)) {
      checked++;
      if (result.ok) {
        console.log(`   ✓ ${result.name}`);
      } else if (result.reason === "missing") {
        console.error(`   ✗ ${result.name}: missing`);
        failures++;
      } else {
        console.error(`   ✗ ${result.name}:`);
        console.error(`       expected: ${result.expected}`);
        console.error(`       actual:   ${result.got}`);
        failures++;
      }
    }
    console.log();
  }

  // Sanity: HSTS/X-Frame/X-Content-Type-Options are non-negotiable.
  const critical = ["strict-transport-security", "x-content-type-options", "x-frame-options"];
  try {
    const root = await fetchHeaders(baseUrl + "/");
    for (const c of critical) {
      if (!root.headers.get(c)) {
        console.error(`✗ critical header missing on /: ${c}`);
        failures++;
      }
    }
  } catch (err) {
    console.error(`✗ could not re-verify critical headers on /: ${err.message}`);
    failures++;
  }

  console.log(`\nChecked ${checked} header assertions; ${failures} failure(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

if (isMain) {
  await main();
}
