/**
 * CSP violation report sink.
 *
 * Public endpoint (bypasses auth — required, since browsers send reports
 * with no cookies/credentials attached and any authenticated report path
 * would be silently dropped). Accepts both wire formats browsers still use
 * in the wild:
 *
 *   1. `application/csp-report`         — legacy CSP2 `report-uri` payload,
 *                                          a single JSON object under
 *                                          `"csp-report"`.
 *   2. `application/reports+json`       — modern Reporting API v1 payload,
 *                                          an array of report envelopes with
 *                                          `type: "csp-violation"`.
 *
 * The handler intentionally does NOT persist anything — reports flow to
 * `console.error` as structured JSON so they show up in the Worker's log
 * stream (Cloudflare Logpush / `wrangler tail`) and
 * can be aggregated externally without introducing another storage
 * dependency or a cross-tenant data path. The endpoint is idempotent and
 * always returns 204, matching browser expectations — a 4xx/5xx here would
 * make Chrome retry with exponential backoff, amplifying any noisy client.
 *
 * Abuse & DoS considerations:
 *   * Body is capped at 64 KiB — a single legitimate CSP report is ~1 KiB;
 *     anything larger is almost certainly abuse or a malformed client.
 *   * We do not echo the request body back to the caller.
 *   * All fields are treated as untrusted strings: the log record uses
 *     explicit property assignment so a malicious `blocked-uri` cannot
 *     inject fake fields into the structured log line.
 *   * Rate limiting is left to the platform layer (Cloudflare Rate Limiting
 *     rules per `docs/OPERATIONS.md`) — the sink itself is stateless.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withClickjackingHeaders } from "@/lib/http/clickjacking";

/**
 * Build every response this route emits with `X-Frame-Options: DENY` +
 * CSP `frame-ancestors 'none'`. File-based server routes bypass the
 * react-start `requestMiddleware` chain, so `securityHeadersMiddleware`
 * never runs here — we stamp the clickjacking defences ourselves.
 */
function reportResponse(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers: withClickjackingHeaders({ "Cache-Control": "no-store", ...extra }),
  });
}

// 64 KiB is ~64x the typical report size and small enough that a flood
// still can't fill a Worker's per-invocation memory budget.
const MAX_BODY_BYTES = 64 * 1024;

// Fields we're willing to surface into the log stream. Everything else is
// dropped — CSP reports have historically leaked user data (session URLs,
// query params) via `document-uri` in some browsers, and we don't want any
// of that flowing into logs beyond origin.
const ALLOWED_CSP_FIELDS = [
  "blocked-uri",
  "document-uri",
  "effective-directive",
  "violated-directive",
  "original-policy",
  "disposition",
  "referrer",
  "source-file",
  "line-number",
  "column-number",
  "status-code",
  "script-sample",
] as const;

type CspReportFieldName = (typeof ALLOWED_CSP_FIELDS)[number];
type RawCspReport = Partial<Record<CspReportFieldName, unknown>>;

interface NormalisedReport {
  format: "csp-report" | "reports+json";
  fields: Record<string, string | number | undefined>;
}

/**
 * Reduce a raw CSP report object down to whitelisted fields, stringifying
 * anything that isn't already a primitive so a hostile client can't smuggle
 * arbitrary JSON structures into our log records.
 *
 * Trims `document-uri` and `referrer` to origin-only, since the path/query
 * of a violation URL commonly contains user-identifying tokens (auth
 * callbacks, share links) that we don't want to persist even in logs.
 */
function normaliseCspReport(raw: RawCspReport, format: NormalisedReport["format"]): NormalisedReport {
  const fields: Record<string, string | number | undefined> = {};
  for (const key of ALLOWED_CSP_FIELDS) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "number") {
      fields[key] = Number.isFinite(value) ? value : undefined;
    } else {
      const str = String(value).slice(0, 2048);
      fields[key] = key === "document-uri" || key === "referrer" ? toOriginOnly(str) : str;
    }
  }
  return { format, fields };
}

function toOriginOnly(candidate: string): string {
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return candidate.slice(0, 256);
  }
}

/**
 * Parse the body once we've enforced the size cap. Returns an empty array
 * if the payload is malformed — the caller emits a single "unparseable"
 * log record in that case rather than throwing (a thrown error would 500,
 * which browsers would then retry).
 */
function extractReports(body: string, contentType: string): NormalisedReport[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  // Reporting API v1: array of envelopes.
  if (Array.isArray(parsed)) {
    const out: NormalisedReport[] = [];
    for (const envelope of parsed) {
      if (envelope && typeof envelope === "object") {
        const body = (envelope as { body?: unknown }).body;
        const type = (envelope as { type?: unknown }).type;
        if (type === "csp-violation" && body && typeof body === "object") {
          out.push(normaliseCspReport(body as RawCspReport, "reports+json"));
        }
      }
    }
    return out;
  }

  // Legacy CSP2: { "csp-report": { ... } }
  if (parsed && typeof parsed === "object" && "csp-report" in parsed) {
    const inner = (parsed as { "csp-report": unknown })["csp-report"];
    if (inner && typeof inner === "object") {
      return [normaliseCspReport(inner as RawCspReport, "csp-report")];
    }
  }

  // Some clients (older Firefox, custom crawlers) POST the report body
  // flat when the content-type advertises `application/csp-report`.
  if (parsed && typeof parsed === "object" && contentType.includes("csp-report")) {
    return [normaliseCspReport(parsed as RawCspReport, "csp-report")];
  }

  return [];
}

async function handleCspReport(request: Request): Promise<Response> {
  // Reject impossible-large bodies before reading them into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    console.warn(
      JSON.stringify({
        event: "csp_report_rejected",
        reason: "body_too_large",
        contentLength: declaredLength,
      }),
    );
    return reportResponse(413);
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES) {
    console.warn(
      JSON.stringify({
        event: "csp_report_rejected",
        reason: "body_too_large_after_read",
        bytes: bodyText.length,
      }),
    );
    return reportResponse(413);
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const reports = extractReports(bodyText, contentType);

  if (reports.length === 0) {
    console.warn(
      JSON.stringify({
        event: "csp_report_unparseable",
        contentType,
        bytes: bodyText.length,
      }),
    );
    // Still 204 — retries wouldn't help a malformed client.
    return reportResponse(204);
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  for (const report of reports) {
    console.error(
      JSON.stringify({
        event: "csp_violation",
        format: report.format,
        userAgent: userAgent.slice(0, 256),
        ...report.fields,
      }),
    );
  }

  return reportResponse(204);
}

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: ({ request }) => handleCspReport(request),
      // Some legacy browsers used POST but the Reporting API spec also allows
      // an OPTIONS preflight. Answer it cheaply so the browser proceeds.
      OPTIONS: () =>
        reportResponse(204, {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        }),
    },
  },
});
