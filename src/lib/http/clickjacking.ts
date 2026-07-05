/**
 * Belt-and-braces clickjacking defences for response paths that do NOT
 * flow through `securityHeadersMiddleware`.
 *
 * `withSecurityHeaders()` in `security-headers.ts` is the primary source of
 * `X-Frame-Options` and CSP `frame-ancestors 'none'` for every response the
 * react-start `requestMiddleware` chain emits (SSR HTML, `createServerFn`
 * payloads, the 500 fallback in `start.ts`). But two response shapes can
 * bypass that chain and would otherwise ship *unframed*:
 *
 *   1. File-based server routes under `src/routes/api/**` — TanStack Router's
 *      `server: { handlers }` blocks execute inside the router runtime,
 *      not the react-start middleware chain, so `securityHeadersMiddleware`
 *      never runs on their responses.
 *   2. JSON error envelopes returned by `jsonErrorResponse()` — these are
 *      constructed as raw `new Response(...)` and returned from server
 *      functions early (rate-limit rejections, validation failures) before
 *      any wrapper gets a chance to touch them if the caller returns the
 *      Response directly from a route handler.
 *
 * The values MUST match those in `security-headers.ts` — the regression test
 * `tests/clickjacking-defences.test.mjs` asserts both files agree.
 *
 * The JSON-error CSP is intentionally minimal (`default-src 'none'` +
 * `frame-ancestors 'none'` + `base-uri 'none'`): a JSON payload never loads
 * scripts, styles, images, or fetches, so the tightest possible policy is
 * both safe and self-documenting.
 */

export const CLICKJACKING_FRAME_OPTIONS = "DENY";

/**
 * Minimal CSP suitable for a non-HTML response (JSON, 204, plain text).
 * Deny everything by default and forbid framing. A frame-ancestors 'none'
 * on a JSON response protects the *browser view* of that URL — some
 * scanners and some browsers will render `application/json` bodies inside
 * a frame, which is enough surface for a UI-redress feint against error
 * pages if a caller loads `/api/...` directly in an iframe.
 */
export const CLICKJACKING_JSON_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/**
 * Merge the two clickjacking headers into an existing header map without
 * clobbering values a caller already set (matches the setIfAbsent semantics
 * of `withSecurityHeaders`).
 */
export function withClickjackingHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out = { ...headers };
  if (!("X-Frame-Options" in out) && !("x-frame-options" in out)) {
    out["X-Frame-Options"] = CLICKJACKING_FRAME_OPTIONS;
  }
  if (
    !("Content-Security-Policy" in out) &&
    !("content-security-policy" in out)
  ) {
    out["Content-Security-Policy"] = CLICKJACKING_JSON_CSP;
  }
  return out;
}
