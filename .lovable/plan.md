# Security hardening + compliance mapping

Goal: raise the codebase to OWASP ASVS L1 / Top 10 2021 with tests, and produce honest SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A control-mapping documentation. No copy anywhere in the app or docs will claim the product "is SOC 2 / ISO 27001 / OWASP compliant" — certification requires an accredited auditor. Docs describe implemented controls factually and note out-of-scope items.

## Scope check first (short investigation)

Before writing code, read the current state so patches are additive, not duplicated:
- `src/lib/http/*` (headers, CSP, HSTS, clickjacking, pre-hydration hash, HTTPS guard)
- `src/routes/api/**` (all server routes — attack surface)
- All `createServerFn(...)` call sites (input validation coverage)
- `src/start.ts` (global middleware)
- Existing tests under `tests/` and `src/**/*.test.ts`
- `docs/COMPLIANCE.md`, `docs/OPERATIONS.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`

## Part A — OWASP ASVS L1 pass (technical patches + tests)

Walk the ASVS L1 chapters that apply to a no-auth clock app. For each, verify existing control, patch gaps, add a test.

1. **V1 Architecture** — document trust boundaries and the "no PII, no auth, no DB" posture in `SECURITY.md` (drives which chapters are N/A).
2. **V5 Validation, sanitization, encoding**
   - Audit every `createServerFn().inputValidator(...)` — ensure Zod schemas exist with bounds (`min`, `max`, `.regex`, `.url`, `.uuid` where relevant).
   - Audit every `/api/**` route handler — same treatment on query/body/headers.
   - Confirm no `dangerouslySetInnerHTML` with untrusted input (grep + assert).
3. **V7 Error handling and logging**
   - Ensure error boundaries do not leak stack traces to the browser in production (`src/routes/__root.tsx` `ErrorComponent` already generic — verify).
   - Ensure CSP-report sink never echoes body (already correct — add a regression test).
4. **V8 Data protection**
   - `Cache-Control: no-store` on any authenticated/sensitive response (N/A for this app — assert and document).
   - Ensure the service worker's HTML NetworkFirst cache does not cache API/JSON responses (audit `vite.config.ts` PWA workbox rules — currently OK for navigations only; add deny-list test).
5. **V11 Business logic / rate limiting**
   - Add lightweight per-IP token-bucket rate limiter middleware for `/api/public/*` (in-memory per Worker isolate is acceptable at ASVS L1; document that platform-level rate limiting — Cloudflare rules — is the durable defence).
   - Wire it into `csp-report` and any other public routes.
6. **V12 Files and resources**
   - No user uploads — assert and document.
7. **V13 API and web service**
   - Ensure every `/api/**` route sets `Content-Type` explicitly and returns JSON via `Response.json` (no reflected content-type).
   - Ensure OPTIONS/CORS is only enabled where needed; deny cross-origin by default. Add a test.
8. **V14 Configuration**
   - Tighten CSP: verify `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; ensure no `'unsafe-inline'` / `'unsafe-eval'` outside the nonce-controlled bootstrap.
   - Confirm HSTS `max-age >= 31536000; includeSubDomains; preload`.
   - Add `Permissions-Policy` header disabling `camera`, `microphone`, `geolocation`, `payment`, `usb`, `interest-cohort`.
   - Add `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: strict-origin-when-cross-origin` (verify + fill gaps).
   - Add a CI-runnable `bun audit` / `npm audit --production` script and fail the build on `high`/`critical`.
   - Verify `bunfig.toml` `minimumReleaseAge` still set (already 24 h, no exclusions — good).

Add tests under `tests/`:
- `tests/security-headers-owasp.test.mjs` — asserts full header set on a rendered response.
- `tests/rate-limit.test.mjs` — asserts the limiter returns 429 past the threshold.
- `tests/api-input-validation.test.mjs` — asserts every `/api/**` route rejects malformed input.
- Extend `package.json` `test` script to include the new suites.

## Part B — OWASP Top 10 2021 review (subset of A + doc)

Produce `docs/SECURITY-TOP10.md` walking A01–A10 with columns: status (Implemented / N/A / Partial), evidence (file paths, test names), and any residual risk. Patches already covered by Part A; this deliverable is the review artefact.

## Part C — SOC 2 + ISO 27001:2022 control mapping (documentation only)

New file `docs/COMPLIANCE-MAPPING.md`. Two tables:

- **SOC 2 Trust Services Criteria** — CC1–CC9 + A1/C1/PI1/P1–P8. Columns: Criterion | Applies to codebase? | Implementation (file/test) | Organizational — out of scope for the codebase.
- **ISO 27001:2022 Annex A** — 93 controls across A.5–A.8. Same column shape.

Honest labels only:
- "Implemented" — control exists in this repo with evidence.
- "Partial" — technical control in place, org policy needed to close it.
- "Organizational — out of scope for the codebase" — HR, physical security, vendor mgmt, board oversight, evidence collection, incident response runbooks, etc.
- "N/A" — no applicable surface (e.g. cryptographic key management for a no-auth static app).

Update the existing `docs/COMPLIANCE.md` header with a one-paragraph disclaimer: "This document maps implemented technical controls to the SOC 2 TSC and ISO 27001:2022 Annex A control families. It is not a certification and does not attest that any organization operating this codebase is SOC 2 or ISO 27001 compliant. Certification requires an accredited external auditor and organizational controls that live outside a codebase."

Add a link from `SECURITY.md` and `README.md`.

## Explicit non-goals

- No claim of "SOC 2 / ISO 27001 / OWASP compliance" anywhere in UI or docs.
- No trust-badge component, no `/trust` marketing page.
- No fake attestations, seals, or auditor names.
- No changes to the app's product surface — this is security + docs only.

## Deliverables

Code:
- `src/lib/http/rate-limit.ts` (+ wired into `/api/public/*`)
- Header additions in `src/lib/http/security-headers.ts` (or equivalent existing module)
- CSP tightening in `src/lib/http/pre-hydration.ts` neighbourhood if needed
- Any input-validation patches surfaced by the audit

Tests:
- `tests/security-headers-owasp.test.mjs`
- `tests/rate-limit.test.mjs`
- `tests/api-input-validation.test.mjs`
- `package.json` `test` script updated

Docs:
- `SECURITY.md` — updated with architecture posture + audit summary
- `docs/SECURITY-TOP10.md` — new
- `docs/COMPLIANCE-MAPPING.md` — new
- `docs/COMPLIANCE.md` — disclaimer header added
- `README.md` — link to the new docs

Verification: `bun run build`, `bun run test`, `bun audit` (or `npm audit --production`) all green before finishing.

## Estimated size

Meaningful pass, ~15–25 file edits, ~3 new tests, ~2 new doc files. Will proceed in one batch on approval and report each patched control at the end.
