/**
 * Same-origin enforcement for server-side callers.
 *
 * This app has no legitimate cross-origin API consumer: the SPA and its
 * server functions are served from the same origin, and there is no
 * documented external caller. Any request whose `Origin` header points at a
 * different site is either a browser CSRF attempt or an unauthorized script
 * trying to piggy-back on a user's session.
 *
 * We use this as defense-in-depth on top of the framework defaults:
 *   - `createServerFn` does not emit `Access-Control-Allow-Origin`, so
 *     browsers already reject cross-origin XHR/fetch to `/_serverFn/*`.
 *   - If a future contributor adds a server route under `src/routes/api/*`,
 *     they should call {@link assertSameOrigin} at the top of the handler
 *     (and NOT set `Access-Control-Allow-Origin: *`). The ESLint rule in
 *     `eslint.config.js` will flag wildcard CORS to catch regressions.
 *
 * Non-browser callers (curl, server-to-server) omit the `Origin` header
 * entirely — we allow those through since they cannot be used to mount a
 * CSRF attack against a signed-in user. When we add authentication later,
 * pair this with a bearer-token check so those callers still need to prove
 * identity.
 */

/**
 * Throw an HTTP 403 `Response` if `request` carries an `Origin` (or
 * `Referer`) header from a host other than the one currently serving the
 * app. Returns silently when the request is same-origin or has no origin
 * header at all.
 *
 * Call at the very top of any server-route handler that performs writes or
 * returns non-public data.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  // No Origin header → non-browser caller (curl, native mobile, server).
  // CSRF requires a browser session, so absence is safe here.
  if (!origin && !referer) return;

  const selfOrigin = new URL(request.url).origin;
  const candidate = origin ?? (referer ? new URL(referer).origin : null);
  if (candidate && candidate !== selfOrigin) {
    throw new Response("Forbidden: cross-origin request rejected", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
