/**
 * Worker edge guard: reject any inbound plaintext `http://` request and force
 * HTTPS with a safe redirect.
 *
 * Runs before the SSR/server-function handler so a plaintext request never
 * reaches route code, never touches session cookies, and never sees CSP nonces.
 *
 * Behaviour:
 *  - Safe, idempotent methods (GET, HEAD) → **301 Moved Permanently** to the
 *    `https://` equivalent, preserving host, path, query, and hash. 301 lets
 *    browsers and caches remember the upgrade indefinitely.
 *  - Any other method (POST/PUT/PATCH/DELETE/etc.) → **403 Forbidden** with a
 *    short text body. Redirecting an unsafe method risks silently replaying a
 *    request body over the wire before the client re-negotiates TLS; refusing
 *    is the only safe answer. RFC 9110 §15.4.9 explicitly notes 308 preserves
 *    the method but does NOT solve the "body already sent in cleartext" problem.
 *  - Every response carries the same HSTS + no-store headers the rest of the
 *    app emits, so intermediaries cannot cache the upgrade shim itself.
 *
 * Trust model for detecting HTTP:
 *  - `new URL(request.url).protocol` — reliable in local dev.
 *  - `Forwarded` (RFC 7239) and `X-Forwarded-Proto` — only trusted when the
 *    request also carries a `CF-Ray` header (proves the hop came from
 *    Cloudflare's edge, not an attacker-controlled origin).
 *  - `CF-Visitor` JSON — Cloudflare-specific fallback with the original scheme.
 *
 * We deliberately upgrade on ANY signal that says "http", rather than requiring
 * consensus, so a downgrade attack on one signal is caught by the others.
 * Unknown / malformed signals are treated as "unknown", not as https — the
 * guard fails open only when no signal declares plaintext.
 */

const HSTS_VALUE = "max-age=63072000; includeSubDomains; preload";

type Scheme = "http" | "https";

/**
 * Parse the first value of a comma-separated proxy header, lowercased. Returns
 * `null` for missing headers, whitespace-only values, or values whose first
 * token isn't a recognised scheme keyword.
 */
function firstToken(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase();
  return first && first.length > 0 ? first : null;
}

/** Normalise recognised scheme tokens; anything else → null. */
function asScheme(value: string | null): Scheme | null {
  if (value === "http" || value === "https") return value;
  return null;
}

/**
 * RFC 7239 `Forwarded` header: `Forwarded: for=1.2.3.4;proto=https;host=x`.
 * We only need the first list element (closest proxy = client-facing edge).
 */
function parseForwarded(value: string | null): { proto?: Scheme; host?: string } {
  if (!value) return {};
  const firstElement = value.split(",")[0] ?? "";
  const out: { proto?: Scheme; host?: string } = {};
  for (const pair of firstElement.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim().toLowerCase();
    let raw = pair.slice(eq + 1).trim();
    // Values may be quoted per RFC 7239.
    if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
      raw = raw.slice(1, -1);
    }
    if (!raw) continue;
    if (key === "proto") {
      const scheme = asScheme(raw.toLowerCase());
      if (scheme) out.proto = scheme;
    } else if (key === "host") {
      out.host = raw;
    }
  }
  return out;
}

/**
 * Read the client-observed scheme, tolerating the various headers different
 * edges emit. Returns `"http"`, `"https"`, or `null` when unknown.
 */
function detectClientScheme(request: Request): Scheme | null {
  // 1. URL protocol — always present, but on Workers this reflects the URL
  //    the runtime handed us (usually https at the edge). Still useful in dev.
  try {
    const proto = new URL(request.url).protocol;
    if (proto === "http:") return "http";
    if (proto === "https:") return "https";
  } catch {
    // Malformed URL — fall through to header signals.
  }

  const fromCloudflare = request.headers.get("cf-ray") !== null;
  if (!fromCloudflare) return null;

  // 2. X-Forwarded-Proto — first token only. Missing / unrecognised → skip
  //    rather than assume https.
  const xfp = asScheme(firstToken(request.headers.get("x-forwarded-proto")));
  if (xfp) return xfp;

  // 3. RFC 7239 Forwarded — modern spec-compliant equivalent of XFP.
  const forwarded = parseForwarded(request.headers.get("forwarded"));
  if (forwarded.proto) return forwarded.proto;

  // 4. CF-Visitor — Cloudflare-specific JSON `{"scheme":"https"}`.
  const cfVisitor = request.headers.get("cf-visitor");
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor) as { scheme?: unknown };
      const scheme = asScheme(typeof parsed.scheme === "string" ? parsed.scheme.toLowerCase() : null);
      if (scheme) return scheme;
    } catch {
      // Ignore malformed CF-Visitor payloads; fall through to unknown.
    }
  }

  return null;
}

/**
 * Idempotent methods per RFC 9110. Only these are safe to auto-upgrade with
 * a redirect — replaying a body over plaintext to negotiate a redirect is
 * exactly the leak this guard exists to prevent.
 */
const REDIRECTABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Validate a host string sourced from a proxy header (`Forwarded host=`,
 * `X-Forwarded-Host`, or the raw `Host` header). We must reject anything
 * that could:
 *  - smuggle a CRLF and inject a second header into the Location response
 *    (classic response-splitting / open-redirect chain),
 *  - carry userinfo (`user:pass@evil.com`) or a path/query/fragment that
 *    would tunnel a redirect target through the host slot,
 *  - masquerade as an authority via bracketed / percent-encoded /
 *    unicode-lookalike bytes that the URL parser silently normalises.
 *
 * Accepted shapes: DNS name, IPv4 literal, bracketed IPv6 literal, each
 * with an optional `:port`. Everything else → reject.
 *
 * Exported for direct unit testing; not part of the module's public API.
 */
export function isSafeHost(host: string | null | undefined): host is string {
  if (typeof host !== "string") return false;

  // 1. Length. RFC 1035 caps a DNS name at 253 chars; add room for
  //    `[ipv6]:port` (max ~47) and clamp at 255 as a hard ceiling.
  if (host.length === 0 || host.length > 255) return false;

  // 2. CRLF / NUL / any C0 / DEL / tab / raw whitespace. A single \r or \n
  //    is the entire header-injection primitive — reject on sight, before
  //    any parser gets a chance to normalise it away.
  //    (\u0000-\u001f covers CR, LF, TAB, VT, FF, NUL, etc.)
  if (/[\u0000-\u001f\u007f ]/.test(host)) return false;

  // 3. Structural delimiters that would let the value escape the authority
  //    slot: `/` `\` `?` `#` `@` (`@` = userinfo separator), and any
  //    percent-encoding (would decode into one of the above post-parse).
  if (/[\\/?#@%]/.test(host)) return false;

  // 4. Explicit charset allowlist. DNS labels + IPv6 brackets + port colon
  //    only. This rejects Unicode homographs, control-picture glyphs,
  //    `..`-style path traversal disguised as a label, etc.
  //    (Punycode-encoded IDNs already fit this allowlist.)
  if (!/^[A-Za-z0-9._:\-[\]]+$/.test(host)) return false;

  // 5. Structural sanity: no leading/trailing dot, no empty labels, no
  //    stray bracket, no bare port. IPv6 literals must be fully bracketed.
  if (host.startsWith(".") || host.endsWith(".")) return false;
  if (host.startsWith(":")) return false;
  if (host.includes("..")) return false;
  const openBrackets = (host.match(/\[/g) ?? []).length;
  const closeBrackets = (host.match(/\]/g) ?? []).length;
  if (openBrackets !== closeBrackets) return false;
  if (openBrackets > 1) return false;
  // A bracket may only appear as an IPv6 literal: `[…]` or `[…]:port`.
  if (openBrackets === 1 && !/^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?$/.test(host)) {
    return false;
  }
  // Only one `:` allowed outside brackets — separates host from port.
  if (openBrackets === 0) {
    const colons = (host.match(/:/g) ?? []).length;
    if (colons > 1) return false;
    if (colons === 1) {
      const [, port] = host.split(":");
      if (!/^\d{1,5}$/.test(port ?? "")) return false;
      const portNum = Number(port);
      if (portNum < 1 || portNum > 65535) return false;
    }
  }

  // 6. Round-trip through the URL parser and confirm the parsed authority
  //    matches the input (case-insensitive). This catches anything the
  //    parser would silently rewrite — IDN → punycode, uppercase-hex IPv6
  //    normalisation, default-port stripping — which would mean the value
  //    the browser sees is different from the value we validated.
  let probe: URL;
  try {
    probe = new URL(`https://${host}/`);
  } catch {
    return false;
  }
  if (probe.pathname !== "/" || probe.search !== "" || probe.hash !== "") {
    return false;
  }
  if (probe.username !== "" || probe.password !== "") return false;
  // `URL.host` strips the default port for the scheme (443 for https), so
  // `example.com:443` normalises to `example.com`. Compare against
  // `hostname[:port]` reconstructed from the parsed pieces to keep the
  // round-trip check strict without false-rejecting default-port inputs.
  // `URL` already lowercases `hostname`, so we skip redundant `.toLowerCase()`
  // calls per comparison — only `expected` (raw user input) needs normalising.
  const hostname = probe.hostname;
  const reconstructed = probe.port ? `${hostname}:${probe.port}` : hostname;
  const expected = host.toLowerCase();
  if (
    reconstructed !== expected &&
    `${hostname}:443` !== expected &&
    `${hostname}:80` !== expected
  ) {
    return false;
  }

  return true;
}

/**
 * Resolve the host to use in the redirect Location. Prefers proxy-declared
 * originals (so the client is sent back to the domain it typed), falling
 * back to the request URL's host. Only proxy headers are trusted when the
 * request came from a known edge (CF-Ray present).
 */
function resolveOriginalHost(request: Request, requestUrl: URL): string {
  const fromCloudflare = request.headers.get("cf-ray") !== null;

  if (fromCloudflare) {
    // 1. RFC 7239 Forwarded host= parameter.
    const forwardedHost = parseForwarded(request.headers.get("forwarded")).host;
    if (isSafeHost(forwardedHost)) return forwardedHost;

    // 2. X-Forwarded-Host — first token.
    const xfh = firstToken(request.headers.get("x-forwarded-host"));
    if (isSafeHost(xfh)) return xfh;

    // 3. Host header as seen by the edge.
    const host = request.headers.get("host");
    if (isSafeHost(host)) return host;
  }

  // 4. Whatever the runtime handed us. Always syntactically valid.
  return requestUrl.host;
}

/**
 * Build the `https://` equivalent of an incoming plaintext URL, preserving
 * host, path, query, and hash exactly. The host is resolved from trusted
 * proxy headers when available so users land on the domain they originally
 * requested, not the internal Worker host.
 */
function toHttpsUrl(request: Request): string {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    // Shouldn't happen — Workers always provide a valid URL — but fall back
    // to a minimal safe target rather than throwing inside the guard.
    return "https://localhost/";
  }

  const host = resolveOriginalHost(request, url);
  url.protocol = "https:";
  url.host = host;

  // Drop the explicit :80 port if it survived host reassignment; :443 is
  // implicit for https and any other custom port stays untouched.
  if (url.port === "80") url.port = "";

  // url.toString() preserves pathname, search, and hash verbatim.
  return url.toString();
}

/**
 * Common headers on every guard response so the shim itself is never cached
 * and always advertises HSTS.
 */
function guardHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Strict-Transport-Security": HSTS_VALUE,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "X-Forwarded-Proto, Forwarded, CF-Visitor, X-Forwarded-Host, Host",
    ...extra,
  };
}

/**
 * True when the request's own URL host is a loopback address. Proxy headers
 * are intentionally ignored here — a real edge deployment never targets
 * loopback, so anything claiming otherwise is either dev or spoofed.
 */
function isLoopbackRequest(request: Request): boolean {
  let host: string;
  try { host = new URL(request.url).hostname; } catch { return false; }
  if (!host) return false;
  const hostLower = host.toLowerCase();
  if (hostLower === "localhost" || hostLower === "127.0.0.1" || hostLower === "::1" || hostLower === "[::1]") return true;
  if (hostLower.startsWith("127.")) return true;
  return false;
}


/**
 * Public entry point: returns a Response when the request must be blocked or
 * redirected, or `null` when the request is already HTTPS (or scheme is
 * unknown but we choose to fail open — the outer handler still applies full
 * security headers).
 */
export function enforceHttps(request: Request): Response | null {
  // Loopback origins are never reachable from the public internet — the
  // Cloudflare edge cannot forward `localhost` / `127.0.0.1` / `[::1]`, so
  // any request we see for them is a local dev / test / health-probe call
  // arriving directly over HTTP. Forcing an HTTPS redirect there just breaks
  // `vite dev` (blank page after the browser follows to https://localhost).
  if (isLoopbackRequest(request)) return null;

  const scheme = detectClientScheme(request);
  if (scheme !== "http") return null;

  const method = request.method.toUpperCase();

  if (REDIRECTABLE_METHODS.has(method)) {
    return new Response(null, {
      status: 301,
      headers: guardHeaders({
        Location: toHttpsUrl(request),
        // Belt-and-braces: some crawlers surface the location text to users.
        "Content-Type": "text/plain; charset=utf-8",
      }),
    });
  }

  // Unsafe method over plaintext — the body (and any Authorization header)
  // has already been transmitted in the clear. Refuse; do not redirect.
  return new Response(
    "HTTPS required. Retry this request over https://.",
    {
      status: 403,
      headers: guardHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    },
  );
}
