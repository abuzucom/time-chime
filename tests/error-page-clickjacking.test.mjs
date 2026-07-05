// Regression test: error pages must never weaken clickjacking defences.
//
// The app's clickjacking posture is set in exactly two places:
//   1. src/routes/__root.tsx — CSP meta with `frame-ancestors 'none'`
//   2. src/lib/http/security-headers.ts — response `X-Frame-Options: DENY`
//      + CSP header with `frame-ancestors 'none'`
//
// Error surfaces (500 fallback, 404 body, in-app error boundary) render
// INSIDE those defences today. The risk this test guards against is a
// well-meaning edit that adds an inline <meta http-equiv=...>, a per-page
// CSP override, or a stray X-Frame-Options header on an error response —
// any of which would silently override the tighter policy for the very
// pages an attacker is most likely to lure users onto.
//
// The check is purely static (no server needed) so it runs in the same
// `node --test` batch as the other unit tests.
//
// Rules enforced, on every error surface:
//   - No `<meta http-equiv="Content-Security-Policy" ...>` tag.
//   - No `<meta http-equiv="X-Frame-Options" ...>` tag. (X-Frame-Options
//     is NOT valid in a meta tag per spec; some browsers honour it, some
//     don't — and any value there can only weaken, never strengthen, the
//     response header.)
//   - No literal "frame-ancestors" token whose next source isn't `'none'`.
//   - No literal "X-Frame-Options" string whose value isn't `DENY`.
//   - No `dangerouslySetInnerHTML` (would let a future edit bypass the JSX
//     checks by pasting raw HTML that contains any of the above).
//
// Run with:  node --test tests/error-page-clickjacking.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Sources to audit
// ---------------------------------------------------------------------------
//
// `body` = the substring of the file that renders an error surface. For
// `error-page.ts` that's the whole file. For `__root.tsx` we scope to the
// `NotFoundComponent` and `ErrorComponent` function bodies so unrelated
// root-shell code (which legitimately declares the CSP meta) doesn't
// trigger false positives.

function extractFunctionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  // Find the opening brace of the function body.
  const braceStart = src.indexOf("{", start);
  if (braceStart < 0) return null;
  // Balanced brace walk — stops at the matching `}` of the function body.
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return null;
}

function loadErrorSurfaces() {
  const surfaces = [];

  // 1. Standalone 500 fallback served by src/server.ts.
  const errorPage = readFileSync(
    resolve(repoRoot, "src/lib/error-page.ts"),
    "utf8",
  );
  surfaces.push({ label: "src/lib/error-page.ts (500 fallback)", body: errorPage });

  // 2 & 3. In-shell 404 and error-boundary React components in __root.tsx.
  const rootSrc = readFileSync(
    resolve(repoRoot, "src/routes/__root.tsx"),
    "utf8",
  );
  for (const name of ["NotFoundComponent", "ErrorComponent"]) {
    const body = extractFunctionBody(rootSrc, name);
    assert.ok(
      body,
      `expected ${name} in src/routes/__root.tsx — update this test if the shape changed`,
    );
    surfaces.push({ label: `src/routes/__root.tsx :: ${name}`, body });
  }

  return surfaces;
}

const SURFACES = loadErrorSurfaces();

// ---------------------------------------------------------------------------
// Individual assertions, run once per error surface
// ---------------------------------------------------------------------------

test("error surfaces enumeration is non-empty (guard against silent skip)", () => {
  assert.ok(
    SURFACES.length >= 3,
    `expected >=3 error surfaces, got ${SURFACES.length}`,
  );
});

for (const { label, body } of SURFACES) {
  test(`${label} — no inline <meta http-equiv="Content-Security-Policy">`, () => {
    // Any per-page CSP meta will merge with (and in most browsers override)
    // the root shell's policy for that page. Not allowed on error routes.
    const match = body.match(
      /<meta[^>]+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i,
    );
    assert.equal(
      match,
      null,
      `${label} declares its own CSP meta: ${match?.[0]}`,
    );
  });

  test(`${label} — no inline <meta http-equiv="X-Frame-Options">`, () => {
    // XFO in a meta tag is spec-invalid; any value there can only weaken
    // the response header, never strengthen it. Ban outright.
    const match = body.match(
      /<meta[^>]+http-equiv\s*=\s*["']X-Frame-Options["'][^>]*>/i,
    );
    assert.equal(
      match,
      null,
      `${label} declares an X-Frame-Options meta (invalid + weakens response header): ${match?.[0]}`,
    );
  });

  test(`${label} — every "frame-ancestors" occurrence is followed by 'none'`, () => {
    // Catches an edit that adds a comment like "// frame-ancestors 'self'"
    // or emits a directive fragment that widens the source list.
    const occurrences = [...body.matchAll(/frame-ancestors\s+([^;"'\s]+|'[^']*')/gi)];
    for (const occ of occurrences) {
      const sourceToken = occ[1];
      assert.equal(
        sourceToken,
        "'none'",
        `${label} weakens frame-ancestors — expected 'none', got "${sourceToken}" in "${occ[0]}"`,
      );
    }
  });

  test(`${label} — every literal "X-Frame-Options" value is "DENY"`, () => {
    // Look for the header name in any string / object literal context and
    // confirm the paired value (delimited by :, =, or ,) is DENY.
    const occurrences = [
      ...body.matchAll(/["']X-Frame-Options["']\s*[,:=]\s*["']([^"']+)["']/gi),
    ];
    for (const occ of occurrences) {
      assert.equal(
        occ[1].trim().toUpperCase(),
        "DENY",
        `${label} sets X-Frame-Options to "${occ[1]}" (must be "DENY")`,
      );
    }
  });

  test(`${label} — no dangerouslySetInnerHTML (would bypass the JSX checks)`, () => {
    // A future edit could paste raw HTML containing a CSP meta or XFO meta
    // that the other rules above wouldn't catch (they scan for literal
    // <meta ...> tags in the source, but a runtime-injected string
    // wouldn't appear as such). Ban the primitive entirely on error surfaces.
    assert.equal(
      /dangerouslySetInnerHTML/.test(body),
      false,
      `${label} uses dangerouslySetInnerHTML — remove it or move the content out of the error surface`,
    );
  });
}

// ---------------------------------------------------------------------------
// Cross-surface invariant
// ---------------------------------------------------------------------------

test("no error surface emits any Content-Security-Policy* response header", () => {
  // Only src/lib/http/security-headers.ts is allowed to set the enforced
  // CSP. If an error surface starts setting its own header (via `new
  // Headers({...})` in a rendered code path), that header would race with
  // — and often override — the middleware-stamped one.
  for (const { label, body } of SURFACES) {
    const match = body.match(
      /["']Content-Security-Policy(?:-Report-Only)?["']\s*[,:]/i,
    );
    assert.equal(
      match,
      null,
      `${label} sets a Content-Security-Policy header directly: ${match?.[0]}`,
    );
  }
});
