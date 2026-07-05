// Regression test: clickjacking defences on every HTML route.
//
// Two independent controls must be present on every HTML response the app
// serves. If either one silently regresses, an attacker can frame the app
// and mount a UI-redress / clickjacking attack:
//
//   1. CSP  `frame-ancestors 'none'`  — modern, spec-compliant, obeyed by
//      Firefox / Chrome / Safari. Emitted via <meta http-equiv> from
//      src/routes/__root.tsx so it ships in the document itself.
//   2. `X-Frame-Options: DENY`        — legacy but still honoured by older
//      user agents and required by several compliance frameworks (PCI-DSS
//      v4 §6.4, ASVS L1 §14.4.7). Applied by:
//         - public/_headers                (static-asset / CDN path)
//         - src/lib/http/security-headers.ts (Worker SSR + server-fn path)
//
// This test enumerates every route file under src/routes/ that produces an
// HTML response (excludes api/ handlers and layout-only routes) and
// asserts both controls are wired up such that they will be present on
// that route's response. It is a *static* test — it does not spin up a
// server — so it runs in the same `node --test` batch as the other unit
// tests and catches the regression at commit time, not deploy time.
//
// The complementary live-response test lives in
// scripts/check-route-headers.mjs (CI job), which fetches the built
// origin and asserts the same two headers on real HTTP responses.
//
// Run with:  node --test tests/clickjacking-defences.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

import { parseHeadersFile } from "../scripts/check-headers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Enumerate HTML routes
// ---------------------------------------------------------------------------

/**
 * Return every route file under src/routes/ that produces an HTML response.
 * Excludes:
 *   - src/routes/api/**             (server-only endpoints, not HTML)
 *   - src/routeTree.gen.ts          (generated router manifest)
 *   - files whose only job is layout wiring for children, identified by an
 *     `<Outlet />`-only default export. We keep those in the list anyway
 *     because they wrap child routes and any regression in their <head>
 *     leaks into every child.
 */
function listHtmlRouteFiles() {
  const routesDir = resolve(repoRoot, "src/routes");
  const results = [];
  walk(routesDir);
  return results;

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const rel = relative(repoRoot, full);
      if (rel.startsWith("src/routes/api")) continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (/\.(tsx|jsx)$/.test(entry)) {
        results.push(rel);
      }
    }
  }
}

const HTML_ROUTES = listHtmlRouteFiles();

// ---------------------------------------------------------------------------
// Extract the enforced CSP from src/routes/__root.tsx
// ---------------------------------------------------------------------------

function readRootCsp() {
  const root = readFileSync(resolve(repoRoot, "src/routes/__root.tsx"), "utf8");
  // Match the httpEquiv: "Content-Security-Policy" block and pull every
  // string literal inside it. We look at the string tokens rather than the
  // rendered `content` because directives are joined with `"; "` at runtime.
  const block = root.match(
    /httpEquiv:\s*["']Content-Security-Policy["'][\s\S]*?content:\s*\[([\s\S]*?)\]\.join/,
  );
  assert.ok(block, "CSP block not found in src/routes/__root.tsx");
  // Directive literals in __root.tsx are double-quoted with `'none'` /
  // `'self'` (single-quoted) tokens inside. Match only double-quoted
  // strings so we don't split on the inner single quotes.
  const directives = [...block[1].matchAll(/"([^"\n]+)"/g)].map((m) => m[1]);
  assert.ok(directives.length > 0, "no directives parsed from CSP block");
  return directives;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("sanity: at least the known HTML routes are discovered", () => {
  // Guard against a repo layout change silently emptying the enumeration —
  // an empty list would make every assertion below vacuously pass.
  assert.ok(
    HTML_ROUTES.length >= 4,
    `expected >=4 HTML route files, found ${HTML_ROUTES.length}: ${HTML_ROUTES.join(", ")}`,
  );
  for (const required of [
    "src/routes/__root.tsx",
    "src/routes/index.tsx",
  ]) {
    assert.ok(
      HTML_ROUTES.includes(required),
      `expected ${required} in the route enumeration`,
    );
  }
});

test("CSP <meta> in __root.tsx contains frame-ancestors 'none'", () => {
  const directives = readRootCsp();
  const match = directives.find((d) => /^\s*frame-ancestors\s+/i.test(d));
  assert.ok(match, `no frame-ancestors directive in CSP: ${directives.join(" | ")}`);
  assert.match(
    match,
    /frame-ancestors\s+'none'/i,
    `frame-ancestors must be 'none', got: "${match}"`,
  );
  // Extra guard: `'none'` must be the ONLY source. `'none'` + any other
  // token is a spec violation and browsers ignore the whole directive.
  const tokens = match.trim().split(/\s+/).slice(1);
  assert.deepEqual(
    tokens,
    ["'none'"],
    `frame-ancestors must have exactly one source ('none'), got: ${tokens.join(" ")}`,
  );
});

test("__root.tsx CSP wraps every HTML route by construction", () => {
  // TanStack Start renders every route inside the root shell, so a single
  // meta tag on __root's head() propagates to all HTML responses. Prove
  // that architectural invariant is intact: __root must define head() and
  // shellComponent, and every other route file must NOT redefine the CSP
  // meta with a weaker frame-ancestors value.
  const rootPath = resolve(repoRoot, "src/routes/__root.tsx");
  const root = readFileSync(rootPath, "utf8");
  assert.match(root, /shellComponent\s*:/, "__root must set shellComponent");
  assert.match(root, /head\s*:\s*\(\)/, "__root must set head()");

  for (const file of HTML_ROUTES) {
    if (file === "src/routes/__root.tsx") continue;
    const src = readFileSync(resolve(repoRoot, file), "utf8");
    const weakened = src.match(/frame-ancestors\s+(?!'none')/i);
    assert.equal(
      weakened,
      null,
      `${file} redefines frame-ancestors with a non-'none' value: "${weakened?.[0]}"`,
    );
  }
});

test("public/_headers sets X-Frame-Options: DENY on /* (all routes)", () => {
  const headersFile = readFileSync(resolve(repoRoot, "public/_headers"), "utf8");
  const groups = parseHeadersFile(headersFile);
  const globalGroup = groups.find((g) => g.pattern === "/*");
  assert.ok(globalGroup, "public/_headers must define a /* group");
  const xfo = globalGroup.headers.find(
    (h) => h.name.toLowerCase() === "x-frame-options",
  );
  assert.ok(xfo, "X-Frame-Options missing from /* group in public/_headers");
  assert.equal(
    xfo.value.trim().toUpperCase(),
    "DENY",
    `X-Frame-Options must be DENY, got "${xfo.value}"`,
  );
});

test("security-headers middleware stamps X-Frame-Options: DENY", () => {
  // Static-check the middleware source: the Worker SSR path does NOT go
  // through public/_headers, so this assertion is the ONLY guarantee for
  // server-function and SSR responses.
  const src = readFileSync(
    resolve(repoRoot, "src/lib/http/security-headers.ts"),
    "utf8",
  );
  assert.match(
    src,
    /["']X-Frame-Options["']\s*,\s*["']DENY["']/i,
    "withSecurityHeaders() must set X-Frame-Options: DENY",
  );
  // And it must be applied via setIfAbsent (i.e. always attempted), not
  // gated behind an env flag or a route predicate.
  assert.match(
    src,
    /setIfAbsent\(\s*target\.headers\s*,\s*["']X-Frame-Options["']/i,
    "X-Frame-Options must be applied unconditionally via setIfAbsent()",
  );
});

test("start.ts wires securityHeadersMiddleware into requestMiddleware", () => {
  // A middleware that isn't registered protects nothing. Prove the wire-up.
  const start = readFileSync(resolve(repoRoot, "src/start.ts"), "utf8");
  assert.match(
    start,
    /securityHeadersMiddleware/,
    "src/start.ts must define securityHeadersMiddleware",
  );
  assert.match(
    start,
    /requestMiddleware:\s*\[[^\]]*securityHeadersMiddleware/,
    "securityHeadersMiddleware must appear in requestMiddleware[]",
  );
});

// ---------------------------------------------------------------------------
// 404 HTML route (TanStack Router notFoundComponent)
// ---------------------------------------------------------------------------
//
// The 404 page renders through the router's notFoundComponent, which mounts
// INSIDE __root's shellComponent. That means the same <meta http-equiv=CSP>
// (with frame-ancestors 'none') ships in the 404 document. What we assert
// here is the architectural invariant that (a) __root defines a
// notFoundComponent so unmatched URLs actually render an HTML shell rather
// than a bare framework error, and (b) that component doesn't redefine the
// CSP meta with a weaker value. The response headers (X-Frame-Options,
// enforced CSP header) are stamped by withSecurityHeaders() on every SSR
// response — including the 404 — because the router still routes through
// the react-start pipeline for unmatched paths. Live coverage lives in
// scripts/check-route-headers.mjs, which fetches a known-404 URL.

test("__root.tsx defines notFoundComponent so 404s render inside the shell", () => {
  const root = readFileSync(resolve(repoRoot, "src/routes/__root.tsx"), "utf8");
  assert.match(
    root,
    /notFoundComponent\s*:/,
    "__root must set notFoundComponent so unmatched URLs render the CSP-bearing shell",
  );
  // Belt-and-braces: no route file may declare its own notFoundComponent
  // that swaps out the shell wrapper — that would bypass the root <head>.
  for (const file of HTML_ROUTES) {
    if (file === "src/routes/__root.tsx") continue;
    const src = readFileSync(resolve(repoRoot, file), "utf8");
    assert.equal(
      /notFoundComponent\s*:/.test(src),
      false,
      `${file} defines its own notFoundComponent; 404s must render through __root's shell`,
    );
  }
});

// ---------------------------------------------------------------------------
// 500 HTML route (Worker fetch-handler fallback)
// ---------------------------------------------------------------------------
//
// The 500 page returned from src/server.ts is emitted OUTSIDE the
// react-start request-middleware chain (the Worker `fetch` handler sits
// above it). If we construct that Response with a plain `new Response(...)`
// no security header ever attaches — X-Frame-Options and CSP would silently
// regress on every uncaught error. This block asserts the 500 payload is
// wrapped by withSecurityHeaders(), and that renderErrorPage() itself does
// not emit a weakened frame-ancestors meta.

test("src/server.ts wraps every 500 response with withSecurityHeaders()", () => {
  const src = readFileSync(resolve(repoRoot, "src/server.ts"), "utf8");
  assert.match(
    src,
    /withSecurityHeaders\s*\(/,
    "src/server.ts must apply withSecurityHeaders() to the 500 fallback",
  );
  // Every place we construct a Response with renderErrorPage() must go
  // through the wrapper. Grep for direct `new Response(renderErrorPage(...)`
  // that isn't inside a withSecurityHeaders(...) call.
  const unwrapped = src.match(
    /(?<!withSecurityHeaders\(\s*)new Response\(\s*renderErrorPage\(/g,
  );
  assert.equal(
    unwrapped,
    null,
    `src/server.ts constructs a raw 500 Response without withSecurityHeaders(): ${unwrapped?.join(", ")}`,
  );
});

test("renderErrorPage() does not weaken frame-ancestors in its inline <head>", () => {
  const src = readFileSync(resolve(repoRoot, "src/lib/error-page.ts"), "utf8");
  // The 500 page is self-contained HTML; it must NOT emit its own CSP meta
  // that overrides the response-header CSP with a laxer frame-ancestors.
  // Two acceptable states: (1) no CSP meta at all (response header wins),
  // (2) a CSP meta that keeps frame-ancestors 'none'.
  const weakened = src.match(/frame-ancestors\s+(?!'none')/i);
  assert.equal(
    weakened,
    null,
    `src/lib/error-page.ts weakens frame-ancestors: "${weakened?.[0]}"`,
  );
});

// ---------------------------------------------------------------------------
// JSON / API error responses
// ---------------------------------------------------------------------------
//
// Two response shapes bypass the react-start `requestMiddleware` chain and
// therefore do NOT get `X-Frame-Options` + CSP frame-ancestors stamped by
// `securityHeadersMiddleware`:
//
//   1. `jsonErrorResponse()` (src/lib/http/json-error.ts) — used by server
//      functions for 4xx/5xx envelopes (rate-limit, validation, etc.).
//   2. File-based server routes under `src/routes/api/**` — TanStack Router's
//      `server: { handlers }` blocks execute inside the router runtime, not
//      the middleware chain.
//
// Both paths funnel through `withClickjackingHeaders()` in
// `src/lib/http/clickjacking.ts`, which enforces the same two controls the
// HTML shell relies on. These tests assert (a) the helper's contract is
// intact, (b) `jsonErrorResponse` runs its headers through it, and (c) the
// public API route(s) use it too.

test("clickjacking helper defines DENY + frame-ancestors 'none' and preserves caller values", () => {
  const src = readFileSync(
    resolve(repoRoot, "src/lib/http/clickjacking.ts"),
    "utf8",
  );
  // Contract 1: exported constants carry the exact values used elsewhere.
  assert.match(
    src,
    /CLICKJACKING_FRAME_OPTIONS\s*=\s*["']DENY["']/,
    "CLICKJACKING_FRAME_OPTIONS must equal 'DENY'",
  );
  assert.match(
    src,
    /CLICKJACKING_JSON_CSP[\s\S]{0,200}frame-ancestors\s+'none'/i,
    "CLICKJACKING_JSON_CSP must contain frame-ancestors 'none'",
  );
  assert.match(
    src,
    /CLICKJACKING_JSON_CSP[\s\S]{0,200}base-uri\s+'none'/i,
    "CLICKJACKING_JSON_CSP must contain base-uri 'none'",
  );
  // Contract 2: helper respects setIfAbsent semantics — it must guard both
  // the canonical and lowercase spellings before writing either header.
  assert.match(
    src,
    /"X-Frame-Options"\s+in\s+out[\s\S]*?"x-frame-options"\s+in\s+out/,
    "withClickjackingHeaders must skip X-Frame-Options when caller already set it (either case)",
  );
  assert.match(
    src,
    /"Content-Security-Policy"\s+in\s+out[\s\S]*?"content-security-policy"\s+in\s+out/,
    "withClickjackingHeaders must skip CSP when caller already set it (either case)",
  );
});

test("jsonErrorResponse stamps clickjacking defences on every envelope", () => {
  const src = readFileSync(
    resolve(repoRoot, "src/lib/http/json-error.ts"),
    "utf8",
  );
  assert.match(
    src,
    /from\s+["']\.\/clickjacking["']/,
    "json-error.ts must import from ./clickjacking",
  );
  assert.match(
    src,
    /withClickjackingHeaders\s*\(/,
    "json-error.ts must run its header map through withClickjackingHeaders()",
  );
});

test("public API routes stamp clickjacking defences on non-HTML responses", () => {
  const apiRoot = resolve(repoRoot, "src/routes/api");
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  })(apiRoot);

  assert.ok(files.length > 0, "expected at least one file under src/routes/api");

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // A file counts as "hardened" if it either goes through
    // withClickjackingHeaders / jsonErrorResponse, or explicitly sets both
    // X-Frame-Options and frame-ancestors on every response it constructs.
    const usesHelper =
      /withClickjackingHeaders\s*\(/.test(src) ||
      /jsonErrorResponse\s*\(/.test(src);
    if (usesHelper) continue;

    const setsXfo = /["']X-Frame-Options["']\s*[,:]\s*["']DENY["']/i.test(src);
    const setsFrameAncestors = /frame-ancestors\s+'none'/i.test(src);
    assert.ok(
      setsXfo && setsFrameAncestors,
      `${relative(repoRoot, file)} constructs Responses without clickjacking defences — import withClickjackingHeaders() from @/lib/http/clickjacking`,
    );
  }
});

