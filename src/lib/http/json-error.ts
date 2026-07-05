/**
 * Canonical JSON error envelope used by server functions and public API
 * routes. Every non-2xx response we author should serialize through
 * {@link jsonErrorResponse} so clients (and log pipelines) see one shape
 * instead of an ad-hoc mix of plain text, HTML, and inconsistent JSON.
 *
 * Shape rationale:
 *  - `error` is a machine-stable slug (snake_case, never localized) so
 *    client code can branch on it without regex-matching a human string.
 *  - `message` is a short human-readable sentence safe to surface in a
 *    toast. It MUST NOT include stack traces, upstream error text, or any
 *    server-internal detail — those go to logs, not to the client.
 *  - `retryAfterSeconds` mirrors the `Retry-After` header for callers
 *    that only read the body (fetch wrappers that discard headers on
 *    non-OK responses are common).
 *  - `retryAt` is an ISO-8601 UTC timestamp computed server-side so the
 *    client doesn't have to add "now + retryAfterSeconds" against a
 *    possibly-skewed local clock. This matters especially here because
 *    the entire app exists to correct that skew.
 *  - `requestId` is optional; when present it lets support correlate a
 *    user report with a specific log line.
 */
export interface JsonErrorBody {
  readonly error: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly retryAt?: string;
  readonly requestId?: string;
}

export interface JsonErrorInit {
  readonly status: number;
  readonly error: string;
  readonly message: string;
  /** When set, populates `Retry-After` and both `retryAfter*` body fields. */
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;
  /** Extra headers merged in — used by the burst limiter to add its own hints. */
  readonly headers?: Record<string, string>;
}

/**
 * Build a `Response` that carries the canonical JSON error body plus the
 * hardening headers every error path needs: `Cache-Control: no-store` so
 * intermediaries don't cache a 429/500 and re-serve it to healthy
 * requests, and `Content-Type: application/json; charset=utf-8` so
 * strict clients parse rather than sniff.
 */
import { withClickjackingHeaders } from "./clickjacking";

export function jsonErrorResponse(init: JsonErrorInit): Response {
  const now = Date.now();
  const body: JsonErrorBody = {
    error: init.error,
    message: init.message,
    ...(init.retryAfterSeconds !== undefined
      ? {
          retryAfterSeconds: init.retryAfterSeconds,
          // ISO-8601 UTC — clients that treat this as authoritative will
          // still be correct even if their local clock is skewed, which
          // is the whole point of this app.
          retryAt: new Date(now + init.retryAfterSeconds * 1000).toISOString(),
        }
      : {}),
    ...(init.requestId !== undefined ? { requestId: init.requestId } : {}),
  };

  // Base transport headers. Clickjacking defences are then merged on top so
  // the JSON envelope carries `X-Frame-Options: DENY` + CSP
  // `frame-ancestors 'none'` even when the response bypasses the react-start
  // `requestMiddleware` chain (see clickjacking.ts for why this matters).
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(init.retryAfterSeconds !== undefined
      ? { "Retry-After": String(init.retryAfterSeconds) }
      : {}),
    ...(init.headers ?? {}),
  };
  const headers = withClickjackingHeaders(baseHeaders);

  return new Response(JSON.stringify(body), { status: init.status, headers });
}
