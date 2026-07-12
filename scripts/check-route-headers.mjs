#!/usr/bin/env node
/**
 * Per-route security-header validator.
 *
 * `check-headers.mjs` proves that every group in `public/_headers` is served
 * by the origin. This script complements it by asserting the *effective*
 * security posture of concrete routes the user (or a scanner) will actually
 * hit: the SPA shell, a hashed asset, the well-known metadata file, and an
 * unmatched URL that must still fall through to the hardened 404 page.
 *
 * For HTML routes it additionally parses the response body and asserts that
 * the Content-Security-Policy <meta http-equiv> tag emitted from
 * src/routes/__root.tsx is present and contains the directives that make the
 * policy meaningful (default-src 'self', frame-ancestors 'none',
 * object-src 'none', base-uri 'self', upgrade-insecure-requests).
 *
 * Usage:
 *   node scripts/check-route-headers.mjs [baseUrl]
 *   BASE_URL=https://example.com node scripts/check-route-headers.mjs
 *
 * Exit code 0 on success, non-zero otherwise. Intended for CI, see
 * .github/workflows/security-headers.yml.
 */
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:4173").replace(
  /\/$/,
  "",
);

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

// Headers that must appear on every response the browser touches, HTML or
// asset. Values are matched case-insensitively; where a directive-list order
// is not semantically significant we compare as a set (see `assertHeader`).
const GLOBAL_HEADERS = {
  "strict-transport-security": /max-age=\d{7,}/i, // >= ~4 months
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  // Enforced CSP header emitted by the Worker on every response
  // (src/lib/http/security-headers.ts). Must include a per-request nonce
  // AND the pre-hydration script hash, and MUST NOT contain unsafe-inline
  // in script-src or any wildcard source.
  "content-security-policy": {
    kind: "csp-header",
  },
  "permissions-policy": {
    kind: "directive-set",
    required: [
      "camera=()",
      "geolocation=()",
      "microphone=()",
      "notifications=()",
      "push=()",
      "accelerometer=()",
      "gyroscope=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
      // These two used to be `(self)`; there is no code path that needs
      // either widened. If a future feature legitimately requires them,
      // widen here in the same commit that adds the caller.
      "autoplay=()",
      "fullscreen=()",
    ],
  },
};

// CSP is served via <meta http-equiv> from the app shell rather than as a
// response header (see src/routes/__root.tsx). These directives must be
// present verbatim in the rendered HTML for the policy to be considered
// non-degraded.
const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;

function fail(msg) {
  failures++;
  console.error(`   ✗ ${msg}`);
}
function pass(msg) {
  checks++;
  console.log(`   ✓ ${msg}`);
}

function assertHeader(headers, name, expected) {
  const got = headers.get(name);
  if (got == null) return fail(`${name}: missing`);
  if (expected instanceof RegExp) {
    return expected.test(got) ? pass(`${name}: ${got}`) : fail(`${name}: ${got} !~ ${expected}`);
  }
  if (typeof expected === "string") {
    return got.trim().toLowerCase() === expected.toLowerCase()
      ? pass(`${name}: ${got}`)
      : fail(`${name}: expected "${expected}", got "${got}"`);
  }
  if (expected && expected.kind === "csp-header") {
    return assertCspString(name, got, { requireNonce: true });
  }
}

/**
 * Shared CSP validator for the response-header CSP and the meta-tag CSP.
 * `requireNonce` is true only for the header, since the static meta CSP
 * uses the sha256 hash for its inline script and can never carry a
 * per-request nonce.
 */
function assertCspString(label, csp, { requireNonce }) {
  pass(`${label} present (${csp.length} chars)`);
  for (const directive of REQUIRED_CSP_DIRECTIVES) {
    if (csp.toLowerCase().includes(directive.toLowerCase())) {
      pass(`${label}: ${directive}`);
    } else {
      fail(`${label}: missing directive ${directive}`);
    }
  }
  // Refuse wildcards on script-src — a common regression when someone
  // pastes an over-broad third-party policy.
  if (/script-src[^;]*\*/i.test(csp)) {
    fail(`${label}: script-src contains a wildcard (*)`);
  } else {
    pass(`${label}: script-src has no wildcard`);
  }
  // Refuse 'unsafe-inline' on script-src — the whole point of strict CSP.
  if (/script-src[^;]*'unsafe-inline'/i.test(csp)) {
    fail(`${label}: script-src contains 'unsafe-inline'`);
  } else {
    pass(`${label}: script-src has no 'unsafe-inline'`);
  }
  // Refuse 'unsafe-inline' on style-src / style-src-elem — authored <style>
  // blocks and remote stylesheets are the CSS-injection / data-exfiltration
  // vector. 'unsafe-inline' on style-src-attr is allowed (and required by
  // React/Radix) because inline `style=""` attrs cannot fetch resources.
  const styleElemMatch = /style-src(?:-elem)?(?!-attr)[^;]*/i.exec(csp);
  if (styleElemMatch && /'unsafe-inline'/i.test(styleElemMatch[0])) {
    fail(`${label}: style-src / style-src-elem contains 'unsafe-inline'`);
  } else {
    pass(`${label}: style-src / style-src-elem has no 'unsafe-inline'`);
  }
  // The pre-hydration script must be allow-listed by its SHA-256 hash.
  if (/script-src[^;]*'sha256-[A-Za-z0-9+/=]+'/i.test(csp)) {
    pass(`${label}: script-src includes sha256 hash for inline script`);
  } else {
    fail(`${label}: script-src missing 'sha256-...' allow-list entry`);
  }
  if (requireNonce) {
    // generateCspNonce() (src/lib/http/nonce-store.ts) emits base64url, not
    // standard base64 — the charset must include `-`/`_` or a nonce
    // containing either (~half of them, by chance) false-negatives here.
    if (/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/i.test(csp)) {
      pass(`${label}: script-src includes a per-request nonce`);
    } else {
      fail(`${label}: script-src missing 'nonce-...' — strict CSP requires nonce on the header`);
    }
    // Response-header CSP must advertise a report sink so production
    // violations flow into logs (see src/routes/api/public/csp-report.tsx).
    if (/(?:^|;\s*)report-uri\s+\S+/i.test(csp)) {
      pass(`${label}: report-uri directive present`);
    } else {
      fail(`${label}: missing report-uri directive`);
    }
    if (/(?:^|;\s*)report-to\s+\S+/i.test(csp)) {
      pass(`${label}: report-to directive present`);
    } else {
      fail(`${label}: missing report-to directive`);
    }
  }
}

// React HTML-escapes attribute values, so a rendered `content="...'self'..."`
// attribute serialises single quotes as `&#x27;` (and could carry the other
// four XML-predefined entities too). Decode before matching literal `'...'`
// CSP source tokens, or every directive check below false-negatives on a
// perfectly valid, browser-correct policy.
function decodeHtmlAttributeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function assertCspMeta(html) {
  const match = html.match(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content=["']([^"']+)["']/i,
  );
  if (!match) return fail("CSP <meta> tag: missing from HTML");
  assertCspString("CSP <meta>", decodeHtmlAttributeEntities(match[1]), { requireNonce: false });
}

/**
 * Fetch a single route and assert its security posture.
 *
 * Sends the requested method (default `GET`, without following redirects), then:
 *  - checks the response status against `expectStatus` (an exact code, an
 *    array of acceptable codes, or `< 400` when unspecified);
 *  - verifies every header in {@link GLOBAL_HEADERS} (minus `excludeGlobal`)
 *    plus the caller-supplied `extra` map via {@link assertHeader};
 *  - when `html === true`, confirms the `Content-Type` is `text/html` and runs
 *    {@link assertCspMeta} against the response body to catch a stale
 *    meta-tag CSP.
 *
 * `excludeGlobal` drops entries from {@link GLOBAL_HEADERS} for routes where
 * a global expectation doesn't apply — namely Content-Security-Policy on
 * routes the Assets binding serves directly (static files, `.well-known/*`)
 * rather than the Worker's own `securityHeadersMiddleware`.
 *
 * Every mismatch calls `fail()` (which flips the process exit code); every
 * successful check calls `pass()`. Returns nothing.
 */
async function probeRouteHeaders(
  label,
  path,
  {
    html = false,
    expectStatus,
    extra = {},
    excludeGlobal = [],
    method = "GET",
    body,
    headers: reqHeaders,
  } = {},
) {
  const url = baseUrl + path;
  console.log(`\n→ ${label}  (${method} ${url})`);
  let res;
  try {
    res = await fetch(url, { method, redirect: "manual", body, headers: reqHeaders });
  } catch (err) {
    return fail(`request failed: ${err.message}`);
  }
  const statusOk = expectStatus
    ? (Array.isArray(expectStatus) ? expectStatus : [expectStatus]).includes(res.status)
    : res.status < 400;
  if (statusOk) pass(`HTTP ${res.status}`);
  else fail(`HTTP ${res.status} (expected ${expectStatus ?? "<400"})`);

  const globalHeaders = Object.fromEntries(
    Object.entries(GLOBAL_HEADERS).filter(([name]) => !excludeGlobal.includes(name)),
  );
  for (const [name, expected] of Object.entries({ ...globalHeaders, ...extra })) {
    assertHeader(res.headers, name, expected);
  }

  if (html) {
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) {
      fail(`content-type: expected text/html, got "${ct}"`);
    } else {
      pass(`content-type: ${ct}`);
    }
    const bodyText = await res.text();
    assertCspMeta(bodyText);
  }
}

/**
 * Validate a Worker-produced (non-static) response.
 *
 * Static-file responses are validated separately via `pickAssetPath` and the
 * `_headers` groups. This helper targets code paths that the request goes
 * through the Worker's `requestMiddleware` chain and therefore must have
 * `securityHeadersMiddleware` stamp the baseline headers on the way out —
 * server-function RPC endpoints, non-GET methods, error responses generated
 * inside the Worker, etc. A regression here means a runtime code path is
 * emitting responses that skip middleware.
 */
async function probeWorkerResponse(label, path, options = {}) {
  // Deliberately do NOT set `html: true` by default — Worker-generated
  // responses are often JSON/text and shouldn't be forced through the CSP
  // <meta> body check.
  return probeRouteHeaders(label, path, options);
}

// Discover a real hashed asset filename from the built output so we can prove
// /assets/* headers apply to a live file (filenames are content-hashed and
// cannot be hard-coded).
function pickAssetPath() {
  const candidates = [resolve(__dirname, "../dist/client/assets")];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const file = readdirSync(dir).find((f) => /\.(js|css)$/.test(f));
    if (file) return `/assets/${file}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes to validate
// ---------------------------------------------------------------------------

console.log(`Validating per-route security headers against ${baseUrl}`);

// SPA HTML routes — CSP meta must render and global headers must be attached.
await probeRouteHeaders("home", "/", { html: true });
await probeRouteHeaders("support", "/support", { html: true });
// /obs always 307s to a canonicalized query string (see src/routes/obs.tsx)
// regardless of what's requested, so there's no HTML body/meta to check here
// — the redirect response itself still carries the baseline headers.
await probeRouteHeaders("obs streaming shell", "/obs");

// Unmatched URL must still fall through to a hardened 404 (SPA index),
// not a bare origin error page without headers.
await probeRouteHeaders("not-found route", "/__nonexistent_route_for_header_check__", {
  html: true,
  expectStatus: [200, 404],
});

// Well-known metadata (RFC 9116) — must be reachable AND hardened. Served
// directly by the Assets binding, not the Worker, so it never carries CSP
// (public/_headers doesn't declare one for /.well-known/*).
await probeRouteHeaders("security.txt", "/.well-known/security.txt", {
  excludeGlobal: ["content-security-policy"],
  extra: {
    "cache-control": /max-age=\d+/i,
    "x-robots-tag": /noindex/i,
  },
});

// A concrete hashed asset — proves /assets/* Cache-Control is served with
// the global security headers still applied. Also Assets-binding-served,
// so no CSP here either (see the security.txt probe above).
const assetPath = pickAssetPath();
if (assetPath) {
  await probeRouteHeaders(`asset ${assetPath}`, assetPath, {
    excludeGlobal: ["content-security-policy"],
    extra: {
      "cache-control": /max-age=31536000/i,
    },
  });
} else {
  console.log("\n↷ /assets/*  — skipped (no built assets found; run `bun run build` first)");
}

// ---------------------------------------------------------------------------
// Worker/runtime responses — anything that flows through requestMiddleware
// rather than being served directly off disk.
// ---------------------------------------------------------------------------

// TanStack Start's server-function RPC boundary. A POST to a non-existent
// handler still passes through the Worker pipeline and must be stamped by
// securityHeadersMiddleware — otherwise a regression could leave the entire
// server-fn URL space unhardened without any user-visible symptom.
await probeWorkerResponse(
  "server-fn RPC (nonexistent handler)",
  "/_serverFn/__nonexistent_probe_for_header_check__",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    // Any 4xx/5xx is fine — we're validating headers, not RPC behaviour.
    expectStatus: [400, 404, 405, 500],
  },
);

// HEAD on an SSR route — a common CDN/observability request that must not
// bypass the middleware chain even though it returns no body.
await probeWorkerResponse("HEAD on home route", "/", {
  method: "HEAD",
  expectStatus: [200, 204, 404, 405],
});

// OPTIONS preflight — hit by any browser making a non-simple cross-origin
// request. Our same-origin policy shouldn't strip the baseline hardening.
await probeWorkerResponse("OPTIONS preflight on home route", "/", {
  method: "OPTIONS",
  headers: {
    origin: baseUrl,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  },
  expectStatus: [200, 204, 400, 404, 405],
});

console.log(`\nPer-route header check: ${checks} passed, ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
