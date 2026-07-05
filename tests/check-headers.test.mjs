// Unit tests for scripts/check-headers.mjs.
//
// Run with:  node --test tests/check-headers.test.mjs
//
// Uses Node's built-in test runner and assert module — no dependencies. Each
// test targets a specific edge case in the parser, the header-normaliser, or
// the group comparator (which drives the pass/fail decision in CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHeadersFile,
  normalise,
  pathForPattern,
  compareGroup,
} from "../scripts/check-headers.mjs";

// ---------------------------------------------------------------------------
// parseHeadersFile
// ---------------------------------------------------------------------------

test("parseHeadersFile: ignores comments, blank lines, and CRLF endings", () => {
  const text = [
    "# top-level comment",
    "",
    "/*",
    "  # inline comment must NOT be treated as a header",
    "  X-Frame-Options: DENY",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
  ].join("\r\n");
  const groups = parseHeadersFile(text);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].pattern, "/*");
  assert.deepEqual(
    groups[0].headers.map((h) => h.name),
    ["X-Frame-Options"],
    "inline `# ...` inside a group is a comment, not a header",
  );
  assert.equal(groups[1].headers[0].value, "public, max-age=31536000, immutable");
});

test("parseHeadersFile: preserves duplicate directive names within a group", () => {
  // Cloudflare accepts repeated header names (e.g. multiple Link: preload).
  // The parser must not silently deduplicate them.
  const text = ["/*", "  Link: </a.css>; rel=preload", "  Link: </b.css>; rel=preload"].join(
    "\n",
  );
  const groups = parseHeadersFile(text);
  assert.equal(groups[0].headers.length, 2);
  assert.deepEqual(
    groups[0].headers.map((h) => h.value),
    ["</a.css>; rel=preload", "</b.css>; rel=preload"],
  );
});

test("parseHeadersFile: values containing colons are not truncated", () => {
  const text = ["/*", "  Content-Security-Policy: default-src 'self'; img-src https:"].join("\n");
  const [group] = parseHeadersFile(text);
  assert.equal(group.headers[0].name, "Content-Security-Policy");
  assert.equal(group.headers[0].value, "default-src 'self'; img-src https:");
});

test("parseHeadersFile: header line before any pattern is discarded", () => {
  // Malformed file — a header appearing before its group must not crash the
  // parser or leak into a later group.
  const text = ["  Orphan: value", "/*", "  X-Frame-Options: DENY"].join("\n");
  const groups = parseHeadersFile(text);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].headers.length, 1);
  assert.equal(groups[0].headers[0].name, "X-Frame-Options");
});

// ---------------------------------------------------------------------------
// normalise
// ---------------------------------------------------------------------------

test("normalise: Permissions-Policy is compared as an unordered set of directives", () => {
  const a = "camera=(), geolocation=(), microphone=()";
  const b = "microphone=(),camera=(),  geolocation=()";
  assert.equal(normalise("Permissions-Policy", a), normalise("permissions-policy", b));
});

test("normalise: header names are case-insensitive for directive-set headers", () => {
  const value = "camera=(), microphone=()";
  assert.equal(normalise("PERMISSIONS-POLICY", value), normalise("permissions-policy", value));
});

test("normalise: non-list headers require exact value semantics (whitespace-collapsed)", () => {
  // HSTS/CSP/etc must match byte-for-byte after whitespace collapse — a stray
  // change like "DENY " vs "DENY" is fine, but "SAMEORIGIN" is not "DENY".
  assert.equal(normalise("X-Frame-Options", "  DENY  "), normalise("X-Frame-Options", "DENY"));
  assert.notEqual(
    normalise("X-Frame-Options", "DENY"),
    normalise("X-Frame-Options", "SAMEORIGIN"),
  );
});

test("normalise: HSTS reordered params are NOT considered equal", () => {
  // Strict-Transport-Security is not directive-set semantics; the browser
  // requires max-age first. The comparator must therefore treat reordering
  // as a mismatch so a downgrade would fail CI.
  const a = "max-age=63072000; includeSubDomains; preload";
  const b = "preload; includeSubDomains; max-age=63072000";
  assert.notEqual(normalise("Strict-Transport-Security", a), normalise("Strict-Transport-Security", b));
});

// ---------------------------------------------------------------------------
// pathForPattern
// ---------------------------------------------------------------------------

test("pathForPattern: known globs map to concrete probe URLs", () => {
  assert.equal(pathForPattern("/*"), "/");
  assert.equal(pathForPattern("/.well-known/*"), "/.well-known/security.txt");
  assert.equal(pathForPattern("/assets/*"), null, "hashed asset filenames are unprobable");
  assert.equal(pathForPattern("/docs/*"), "/docs/");
  assert.equal(pathForPattern("/exact/path"), "/exact/path");
});

// ---------------------------------------------------------------------------
// compareGroup (the CI pass/fail engine)
// ---------------------------------------------------------------------------

function makeHeaders(record) {
  // Headers is case-insensitive; use the platform primitive so tests match
  // real fetch() behaviour instead of a bespoke lookup.
  return new Headers(record);
}

test("compareGroup: exact match passes", () => {
  const group = {
    pattern: "/*",
    headers: [
      { name: "X-Frame-Options", value: "DENY" },
      { name: "X-Content-Type-Options", value: "nosniff" },
    ],
  };
  const results = compareGroup(
    group,
    makeHeaders({ "x-frame-options": "DENY", "x-content-type-options": "nosniff" }),
  );
  assert.ok(results.every((r) => r.ok));
});

test("compareGroup: missing header is flagged with reason 'missing'", () => {
  const group = { pattern: "/*", headers: [{ name: "X-Frame-Options", value: "DENY" }] };
  const [res] = compareGroup(group, makeHeaders({}));
  assert.equal(res.ok, false);
  assert.equal(res.reason, "missing");
  assert.equal(res.got, null);
});

test("compareGroup: mismatched value is flagged with reason 'mismatch'", () => {
  const group = { pattern: "/*", headers: [{ name: "X-Frame-Options", value: "DENY" }] };
  const [res] = compareGroup(group, makeHeaders({ "x-frame-options": "SAMEORIGIN" }));
  assert.equal(res.ok, false);
  assert.equal(res.reason, "mismatch");
  assert.equal(res.got, "SAMEORIGIN");
});

test("compareGroup: Permissions-Policy passes when directives are reordered", () => {
  const group = {
    pattern: "/*",
    headers: [
      {
        name: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=()",
      },
    ],
  };
  const [res] = compareGroup(
    group,
    makeHeaders({ "permissions-policy": "microphone=(), camera=(), geolocation=()" }),
  );
  assert.equal(res.ok, true);
});

test("compareGroup: Permissions-Policy fails when a required directive is dropped", () => {
  const group = {
    pattern: "/*",
    headers: [
      {
        name: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=()",
      },
    ],
  };
  const [res] = compareGroup(
    group,
    // microphone omitted — must fail even though the remaining directives match.
    makeHeaders({ "permissions-policy": "camera=(), geolocation=()" }),
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, "mismatch");
});

test("compareGroup: duplicate directives within Permissions-Policy are ignored", () => {
  // Set semantics — a duplicated directive on the wire must still satisfy the
  // spec value (real intermediaries have been known to double-append).
  const group = {
    pattern: "/*",
    headers: [{ name: "Permissions-Policy", value: "camera=(), microphone=()" }],
  };
  const [res] = compareGroup(
    group,
    makeHeaders({ "permissions-policy": "camera=(), microphone=(), camera=()" }),
  );
  assert.equal(res.ok, true);
});

test("compareGroup: header lookup is case-insensitive", () => {
  const group = { pattern: "/*", headers: [{ name: "X-Frame-Options", value: "DENY" }] };
  const [res] = compareGroup(group, makeHeaders({ "X-FRAME-OPTIONS": "DENY" }));
  assert.equal(res.ok, true);
});
