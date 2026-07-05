// Unit tests for the strict host-validator used by the HTTPS redirect guard.
//
// The validator gates values pulled from proxy-supplied headers
// (`Forwarded host=`, `X-Forwarded-Host`, and the raw `Host` header) before
// they land in a `Location:` response. A permissive validator here is the
// classic setup for CRLF/response-splitting and open-redirect chains, so
// each rejection rule gets its own named assertion.
//
// The validator is imported from the TypeScript source via `--experimental-strip-types`
// (already used by the consent test suite in package.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeHost } from "../src/lib/http/https-guard.ts";

// ---------------------------------------------------------------------------
// Accept: real-world shapes we must not break
// ---------------------------------------------------------------------------

const VALID = [
  "example.com",
  "sub.example.com",
  "EXAMPLE.com",               // case-insensitive DNS
  "example.com:443",
  "example.com:8080",
  "localhost",
  "localhost:8080",
  "127.0.0.1",
  "127.0.0.1:8080",
  "[::1]",
  "[::1]:8080",
  "[2001:db8::1]",
  "[2001:db8::1]:443",
  "xn--nxasmq6b.example",      // punycode IDN
  "a".repeat(63) + ".example.com",
];

for (const host of VALID) {
  test(`accepts valid host: ${host}`, () => {
    assert.equal(isSafeHost(host), true, `expected ${host} to validate`);
  });
}

// ---------------------------------------------------------------------------
// Reject: CRLF / control-char injection (the primary threat model)
// ---------------------------------------------------------------------------

const CRLF_INJECTION = [
  "example.com\r\nX-Injected: 1",
  "example.com\rSet-Cookie: session=evil",
  "example.com\nLocation: https://evil.com",
  "example.com\r\n\r\n<html>",
  "example.com\tinjected",
  "example.com\u0000null",
  "example.com\u007fdel",
  "example.com\u000bvtab",
  "example.com\u000cff",
  "\r\nexample.com",
  "example.com\r",
  "example.com\n",
  " example.com",              // raw space
  "example.com ",
  "example .com",
];

for (const host of CRLF_INJECTION) {
  test(`rejects CRLF/control injection: ${JSON.stringify(host)}`, () => {
    assert.equal(
      isSafeHost(host),
      false,
      `expected ${JSON.stringify(host)} to be rejected`,
    );
  });
}

// ---------------------------------------------------------------------------
// Reject: authority-syntax abuse (would let value escape the host slot)
// ---------------------------------------------------------------------------

const AUTHORITY_ABUSE = [
  "user:pass@evil.com",        // userinfo → redirects to evil.com
  "evil.com@example.com",      // reversed userinfo trick
  "example.com/path",          // path smuggled into host
  "example.com?query=1",       // query smuggled
  "example.com#fragment",      // fragment smuggled
  "example.com\\evil.com",     // backslash (IE-style scheme confusion)
  "//example.com",             // protocol-relative
  "example.com%00",            // percent-encoded NUL
  "example.com%0d%0aX: y",     // percent-encoded CRLF
  "example%2ecom",             // percent-encoded dot
  "example.com:",              // dangling port separator
  "example.com:99999",         // port > 65535
  "example.com:0",             // port zero
  "example.com:-1",
  "example.com:abc",           // non-numeric port
  "example.com:80:80",         // double port
  ":8080",                     // bare port
  ".example.com",              // leading dot
  "example.com.",              // trailing dot
  "example..com",              // empty label
  "[::1",                      // unbalanced bracket
  "::1]",
  "[::1][::2]",                // multiple bracket groups
  "[not:an:ipv6:literal:xyz]", // bracket allowlist violation
  "[example.com]",             // brackets around DNS name
  "exämple.com",               // raw unicode (only punycode allowed)
  "example\u200b.com",         // zero-width space homograph
  "",
  " ",
];

for (const host of AUTHORITY_ABUSE) {
  test(`rejects authority abuse: ${JSON.stringify(host)}`, () => {
    assert.equal(
      isSafeHost(host),
      false,
      `expected ${JSON.stringify(host)} to be rejected`,
    );
  });
}

// ---------------------------------------------------------------------------
// Reject: type / length edge cases
// ---------------------------------------------------------------------------

test("rejects null", () => assert.equal(isSafeHost(null), false));
test("rejects undefined", () => assert.equal(isSafeHost(undefined), false));
test("rejects non-string input", () => {
  // @ts-expect-error — deliberate invalid input for the runtime check.
  assert.equal(isSafeHost(12345), false);
  // @ts-expect-error
  assert.equal(isSafeHost({ host: "example.com" }), false);
});

test("rejects hosts longer than 255 chars", () => {
  const tooLong = "a".repeat(256) + ".com";
  assert.equal(isSafeHost(tooLong), false);
});

test("accepts hosts at exactly the 255-char ceiling", () => {
  // 255 chars total, all valid label bytes.
  const atLimit = ("a".repeat(63) + ".").repeat(3) + "a".repeat(63);
  assert.equal(atLimit.length, 255);
  assert.equal(isSafeHost(atLimit), true);
});
