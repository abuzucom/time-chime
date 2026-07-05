# OWASP Top 10 (2021) — Review

_Last reviewed: 2026-07-02_

This document walks the OWASP Top 10 (2021) against the Time Chime codebase
and records the concrete control, the file that implements it, and any
residual risk that lives with the operator rather than the code. It is a
**self-review** by the maintainers, not an external audit or certification.

Companion documents:

- [`SECURITY.md`](../SECURITY.md) — disclosure policy and reporter contact.
- [`docs/COMPLIANCE.md`](./COMPLIANCE.md) — application profile and shared-responsibility split.
- [`docs/COMPLIANCE-MAPPING.md`](./COMPLIANCE-MAPPING.md) — SOC 2 TSC + ISO/IEC 27001:2022 Annex A control mapping.

Statuses used below:

- **Implemented** — a concrete control exists in this repo with a file / test to point at.
- **Partial** — a technical control exists but closing the risk requires an operator action.
- **N/A** — the risk has no attack surface in this app (documented so a scanner reviewer sees it was considered, not overlooked).

---

## A01:2021 — Broken Access Control — N/A

There are no authenticated resources, no user accounts, no server-side
sessions, and no per-user data. Every route in `src/routes/` is public by
design. Server functions under `src/routes/api/` are stateless proxies or
sinks; none read or write user data.

Residual risk: an operator who forks the app and adds authentication MUST
introduce the standard access-control patterns (authorization middleware,
`_authenticated/` route gate, RLS on any persistence layer). This repo does
not paper over that with defaults that would be wrong for a multi-user app.

## A02:2021 — Cryptographic Failures — Implemented (Partial upstream)

- TLS enforced end-to-end: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (`src/lib/http/security-headers.ts` `HSTS_VALUE`).
- CSP `upgrade-insecure-requests` prevents mixed content on any transitional deploy.
- No secrets shipped to the browser bundle — `import.meta.env.VITE_*` only exposes publishable identifiers; the ESLint / typecheck build fails if a `process.env.*` reference leaks into a client module (see `src/lib/http/https-guard.ts` and the module split in `src/integrations/`).
- Crypto uses browser-native `SubtleCrypto` (no bundled crypto library that could carry a CVE).
- No PII at rest server-side; the app has no database.

Residual risk: TLS termination and cipher-suite selection are the hosting
provider's job. Cloudflare's default is aligned with Mozilla "Intermediate";
operators on other hosts should verify their configuration against
[SSL Labs](https://www.ssllabs.com/ssltest/).

## A03:2021 — Injection — Implemented

- Every server function uses a `zod`-typed `inputValidator` (grep: `.inputValidator(` under `src/`).
- Route search params use `validateSearch` with typed parsers (`src/routes/obs.tsx`, `src/routes/index.tsx`).
- React auto-escapes all rendered content. `dangerouslySetInnerHTML` is not used anywhere in `src/` — CI grep asserts this.
- CSP forbids inline event handlers and `eval` (see `<meta http-equiv>` in `src/routes/__root.tsx`).
- No SQL, no shell exec, no template evaluation on user input — the app has no database and no server-side rendering of user content.
- The CSP report sink treats every incoming field as untrusted and truncates before logging (`src/routes/api/public/csp-report.tsx`, `normaliseCspReport`).

## A04:2021 — Insecure Design — Implemented

- Privacy-by-design: zero data collection is a hard architectural invariant, not a runtime toggle.
- Deny-by-default CSP and Permissions-Policy — every capability must be explicitly whitelisted to be usable.
- SSRF-safe by design: the one server function that touches the network calls a fixed allow-list of provider URLs (`PROVIDER_CATALOG` in `src/lib/time.functions.ts`); it cannot be induced to fetch an attacker-supplied URL.
- Rate-limiting posture is documented up-front (`docs/OPERATIONS.md`) so operators know the in-code burst limiter is the last-mile defence, not the primary quota.

## A05:2021 — Security Misconfiguration — Implemented

Baseline headers set on every SSR response (`src/lib/http/security-headers.ts`) and re-asserted on static assets (`public/_headers`), with `scripts/check-route-headers.mjs` in CI diffing the two so they can never drift:

| Header | Value |
| ------ | ----- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Strict, nonce-based, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, no `unsafe-inline`, no `unsafe-eval` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Permissions-Policy` | 23 directives denied, alphabetised (`security-headers.ts` `PERMISSIONS_POLICY_VALUE`) |

Verifying tests: `tests/check-headers.test.mjs`, `tests/clickjacking-defences.test.mjs`, `tests/pre-hydration-hash.test.mjs`, `tests/security-headers-e2e.test.mjs`.

## A06:2021 — Vulnerable & Outdated Components — Implemented

- Lockfile (`bun.lockb`) committed.
- `bunfig.toml` `minimumReleaseAge = 24h` — a compromised release cannot land in `main` within its first day.
- `.github/workflows/dependency-audit.yml` runs `npm audit` + OSV-Scanner daily and on every PR; high/critical findings fail the job.
- Dependabot enabled via `.github/dependabot.yml`.
- Documented remediation SLA in [`docs/COMPLIANCE.md#dependency-remediation-sla`](./COMPLIANCE.md#dependency-remediation-sla): critical fixed within 72 hours, high within 7 days.

## A07:2021 — Identification and Authentication Failures — N/A

No authentication surface. Same rationale as A01.

## A08:2021 — Software & Data Integrity Failures — Implemented

- All JS is same-origin bundled — no third-party script hosts are allowlisted by CSP, so SRI is enforced by origin rather than per-tag hashes.
- The single inline bootstrap script has its SHA-256 hash pinned in CSP (`src/lib/http/pre-hydration.ts`, verified by `tests/pre-hydration-hash.test.mjs`) — any tampering with the shipped hydration script causes the browser to refuse to execute it.
- Service worker uses Workbox precache with build-time-generated revision hashes; a corrupted asset invalidates its cache entry.
- Signed commits recommended (operator responsibility; see [`docs/COMPLIANCE.md#operator-checklist`](./COMPLIANCE.md#operator-checklist)).

## A09:2021 — Security Logging & Monitoring Failures — Partial

- Client emits **no** telemetry, analytics, or error reporting by design (GDPR / CCPA / TDPSA posture).
- Server-side CSP violations flow to `console.error` as structured JSON, surfacing in `wrangler tail` / Cloudflare Logpush without a cross-tenant storage dependency (`src/routes/api/public/csp-report.tsx`).
- Weekly OWASP ZAP baseline scan against the published site: `.github/workflows/zap-baseline.yml`; results in [`docs/COMPLIANCE.md`](./COMPLIANCE.md).

Residual risk: log **retention** and **alerting** are operator responsibilities.
`docs/OPERATIONS.md` documents the recommended edge-layer configuration.

## A10:2021 — Server-Side Request Forgery — Implemented

- The only outbound-fetching server function (`src/lib/time.functions.ts`) selects its target from `PROVIDER_CATALOG`, a static allow-list defined in the same file. User input can pick which provider, but cannot supply a URL.
- The provider catalog is code-reviewed for scheme (`https:` only), host (public metrology institutes), and path (fixed API endpoints).
- The `https-guard` middleware (`src/lib/http/https-guard.ts`) rejects any request whose `Host` header does not match the deployed origin, blocking Host-header rebinding as an SSRF pivot; property-based fuzz tests in `tests/https-guard-fuzz.test.mjs` and unit tests in `tests/https-guard-host-validation.test.mjs`.

---

## Not on the 2021 list but tracked

- **CSP with nonce, not `unsafe-inline`.** The nonce is per-request from `nonce-store.ts` and referenced by both the bootstrap script and by any dynamically added `<style>`. This is stronger than the 2021 list requires (which pre-dated widespread nonce adoption) but is treated as baseline.
- **Body-size caps** on every public endpoint (`csp-report`: 64 KiB). Prevents memory-pressure DoS on a Worker.
- **Bounded in-memory burst limiter** (`src/lib/http/burst-limiter.ts`) as a last-mile defence against a runaway client. Documented as best-effort; the durable per-IP quota is a Cloudflare Rate Limiting rule (see `docs/OPERATIONS.md`).
