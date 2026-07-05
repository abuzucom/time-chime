import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { enforceHttps } from "./lib/http/https-guard";
import { withSecurityHeaders } from "./lib/http/security-headers";

/**
 * Build the 500 fallback Response with the full security-header baseline
 * applied. The Worker fetch handler sits OUTSIDE the react-start request
 * middleware chain, so responses constructed here must be wrapped manually
 * — otherwise clickjacking defences (X-Frame-Options, CSP frame-ancestors),
 * HSTS, Referrer-Policy, and Permissions-Policy would silently regress on
 * every error page. Regression guard: tests/clickjacking-defences.test.mjs.
 */
function buildErrorResponse(): Response {
  return withSecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${sanitizeForLog(body)}`));
  return buildErrorResponse();
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Never interpolate untrusted strings straight into a log line:
// - CR/LF let an attacker forge additional log entries (log injection).
// - Unbounded length can wedge log pipelines.
// The body is server-derived here, but we treat it as untrusted defense-in-depth.
function sanitizeForLog(value: string, maxLen = 500): string {
  const stripped = value.replace(/[\r\n\t\u2028\u2029]+/g, " ");
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…[truncated]` : stripped;
}


export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Edge guard: reject any inbound http:// request before route code runs.
    // Safe methods get a 301 upgrade; unsafe methods are refused with 403
    // because the body has already crossed the wire in cleartext.
    const httpsRedirect = enforceHttps(request);
    if (httpsRedirect) return httpsRedirect;

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return buildErrorResponse();
    }
  },
};
