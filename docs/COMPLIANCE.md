# Security & Compliance Mapping

_This page is maintained by the Time Chime project maintainers to document
the security controls implemented in this repository. It is **not** a
certification and does **not** imply audit outcomes under any framework.
Certification requires an accredited external auditor and organizational
controls that live outside a codebase._

**Companion documents:**

- [`docs/SECURITY-TOP10.md`](./SECURITY-TOP10.md) — OWASP Top 10 (2021) self-review, per-item evidence.
- [`docs/COMPLIANCE-MAPPING.md`](./COMPLIANCE-MAPPING.md) — SOC 2 TSC and ISO/IEC 27001:2022 Annex A full control tables with honest "Organizational — out of scope for the codebase" labelling.

_Last reviewed: 2026-07-02_

## Application profile

Time Chime is a static, client-side clock and chime app packaged for the
web and (via Capacitor) iOS and Android. Its threat surface is intentionally
narrow:

| Attribute                          | Value                                              |
| ---------------------------------- | -------------------------------------------------- |
| User accounts / authentication     | **None**                                           |
| Personal data collected            | **None** (all preferences local to the device)     |
| Third-party trackers / analytics   | **None**                                           |
| Backend state store                | **None** (server functions are stateless proxies)  |
| Outbound network calls             | HTTPS to user-selected stratum-1 time providers    |
| Payment processing                 | **None** (donations link out to external platforms) |

Because there is no backend user data or authentication surface, the
"shared responsibility" split under SOC 2 / ISO 27001 is:

- **App code** (this repo): secure defaults, input validation, output
  encoding, dependency hygiene, security headers, disclosure policy.
- **Hosting provider** (Cloudflare / self-hosted): TLS termination, DDoS
  protection, physical / environmental controls, monitoring.
- **Operator** (whoever deploys this): change management, access control to
  the hosting account, incident response runbooks.

---

## OWASP Top 10 (2021)

| ID     | Risk                                | Applicability | Control in this repo                                                                 |
| ------ | ----------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| A01    | Broken Access Control               | N/A           | No authenticated resources.                                                          |
| A02    | Cryptographic Failures              | Partial       | TLS enforced via HSTS + `upgrade-insecure-requests`; no secrets in the client.       |
| A03    | Injection                           | ✅            | All user-supplied values (settings, `/obs` URL params) validated with typed parsers. |
| A04    | Insecure Design                     | ✅            | Privacy-by-design: zero data collection; deny-by-default CSP; no dynamic `eval`.     |
| A05    | Security Misconfiguration           | ✅            | CSP, HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy set (see `public/_headers`). |
| A06    | Vulnerable & Outdated Components    | ✅            | `bun audit` / `npm audit` in CI; Dependabot / Renovate recommended.                  |
| A07    | Identification & Auth Failures      | N/A           | No auth surface.                                                                     |
| A08    | Software & Data Integrity Failures  | ✅            | Lockfile committed; subresource integrity via same-origin bundling.                  |
| A09    | Security Logging & Monitoring       | Partial       | Client emits no telemetry by design; operator responsible for edge-layer logs.       |
| A10    | Server-Side Request Forgery         | ✅            | The one server function calls a fixed allow-list of provider URLs (`PROVIDER_CATALOG`). |

## OWASP ASVS 4.0 — Level 1

Controls that apply to a static SPA with a thin server-function layer:

- **V1 Architecture** — Threat model captured in this document; no auth or
  data classification because none is collected.
- **V5 Validation, Sanitization & Encoding** — Every input is passed
  through a typed validator (`zod` for server functions, `validateSearch`
  for route params, typed setters for settings). React auto-escapes output;
  `dangerouslySetInnerHTML` is not used.
- **V7 Error Handling & Logging** — No user PII is logged. Server-function
  errors return a generic message to the client and log details server-side.
- **V8 Data Protection** — No data at rest server-side. Client data lives
  in `localStorage`; the Settings drawer offers Export & Delete.
- **V10 Malicious Code** — No dynamic code loading, no `eval`, no
  `Function()`; CSP forbids inline event handlers.
- **V12 File & Resources** — No file upload surface.
- **V13 API & Web Service** — Server functions use typed input validators
  and same-origin RPC only.
- **V14 Configuration** — Security headers documented in
  `public/_headers`; secrets never bundled to the client
  (`VITE_*` reviewed; only publishable identifiers exposed).

## ISO/IEC 27001:2022 — Annex A (applicable controls)

| Control        | Title                                       | How addressed                                                     |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| A.5.1          | Policies for information security           | This repo's `SECURITY.md` + `docs/COMPLIANCE.md`.                 |
| A.5.7          | Threat intelligence                         | Dependency audit + GitHub Security advisories subscribed.         |
| A.5.23         | Information security for use of cloud       | Hosting provider (Cloudflare) attestations relied on.             |
| A.5.24 – 5.28  | Incident management                         | Disclosure policy & response SLAs in `SECURITY.md`.               |
| A.8.8          | Management of technical vulnerabilities     | `bun audit` in CI, Dependabot / Renovate.                         |
| A.8.9          | Configuration management                    | All configuration in-repo; no runtime mutability.                 |
| A.8.15         | Logging                                     | Client emits no logs by design; edge-layer logs are operator-owned. |
| A.8.23         | Web filtering                               | Strict CSP; no third-party script hosts allowlisted.              |
| A.8.24         | Use of cryptography                         | TLS-only; browser-native `SubtleCrypto` where crypto is needed.   |
| A.8.25 – 8.28  | Secure development                          | Typed code, PR review, tests, dependency pinning.                 |

## SOC 2 — Trust Services Criteria (applicable)

| Criterion   | Description                                                   | Evidence in this repo                                              |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| CC1         | Control environment                                           | Governance in `README.md`, `SECURITY.md`, `LICENSE`.               |
| CC2         | Communication of security policies                            | This document + `SECURITY.md` published in-repo and at `/.well-known/security.txt`. |
| CC3         | Risk assessment                                               | Threat model above; scope limited by design.                       |
| CC4         | Monitoring of controls                                        | CI runs typecheck, lint, tests, and dependency audit on every PR.  |
| CC5         | Control activities                                            | Branch protection + code review required for `main`.               |
| CC6.1 – 6.8 | Logical access                                                | No production data plane in-app; hosting-account access is operator-owned. |
| CC7.1 – 7.5 | System operations / incident response                         | Disclosure policy, SLAs, and reporter contact in `SECURITY.md`.    |
| CC8.1       | Change management                                             | Version-controlled; lockfile committed; releases tagged.           |
| CC9         | Risk mitigation                                               | Deny-by-default CSP; least-privilege server functions.             |
| **Privacy** | P1 – P8 (only P1, P4, P5 applicable)                          | No PII collected → notice, choice, and retention obligations minimal; see privacy screen in the app. |

## Operator checklist

If you deploy this app under your own brand and need to demonstrate the
above controls to auditors or customers, complete the following in addition
to what the repo provides:

1. **Enable branch protection** on `main` (require reviews, signed commits,
   passing CI). — *CC5, CC8.1*
2. **Dependabot is enabled** via [`.github/dependabot.yml`](../.github/dependabot.yml)
   and [`.github/workflows/dependency-audit.yml`](../.github/workflows/dependency-audit.yml)
   runs `npm audit` + OSV-Scanner daily and on every PR. Triage per the
   [Dependency remediation SLA](#dependency-remediation-sla) below. — *A.8.8, A03*
3. **Enable your hosting provider's WAF and DDoS protection.** — *CC6.6*
4. **Configure access logging** at the edge; retain per your policy.
   — *A.8.15, CC7.2*
5. **Fill in the placeholder contacts** in `SECURITY.md` and
   `public/.well-known/security.txt` with monitored addresses.
6. **Rotate the `Expires:` date** in `security.txt` at least annually.
7. **Verify security headers** with the Mozilla Observatory / SecurityHeaders.com
   after each deploy. — *A.5, A.8.23*
8. **Document your own incident-response runbook** referencing the SLAs in
   `SECURITY.md`. — *CC7.3 – 7.5, ISO A.5.24–5.28*

## OWASP ZAP baseline scan

A weekly [OWASP ZAP baseline](https://www.zaproxy.org/docs/docker/baseline-scan/)
runs against the published site via the workflow
[`.github/workflows/zap-baseline.yml`](../.github/workflows/zap-baseline.yml).
The workflow rewrites the block below with the outcome of the most recent run
(schedule: Mondays 06:00 UTC; also triggerable on demand). Full HTML/JSON/MD
reports are attached to the workflow run as artifacts and, when the scan finds
anything, opened as a tracking issue.

<!-- ZAP-BASELINE:START -->
_No scan recorded yet. Trigger `.github/workflows/zap-baseline.yml` from the
Actions tab to populate this block._
<!-- ZAP-BASELINE:END -->

## Dependency remediation SLA

Automated scanners ([Dependabot](../.github/dependabot.yml),
[`npm audit`](../.github/workflows/dependency-audit.yml), and
[OSV-Scanner](https://google.github.io/osv-scanner/)) run on every push,
every PR, and daily at 07:00 UTC against unchanged code. High- and
critical-severity findings **fail the CI job**, block merge to `main`,
and open a GitHub Security alert. The maintainer response targets are:

| Severity (CVSS v3.1)      | Acknowledge | Fix or documented mitigation | Notes                                                                                     |
| ------------------------- | ----------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| **Critical** (9.0 – 10.0) | 1 business day | **72 hours**                | Out-of-band release; if no upstream patch exists, apply a workaround and pin the version. |
| **High** (7.0 – 8.9)      | 2 business days | **7 days**                  | Merged via the next release; CI stays red until resolved.                                 |
| **Medium** (4.0 – 6.9)    | 5 business days | **30 days**                 | Batched into the weekly Dependabot minor/patch group.                                     |
| **Low** (0.1 – 3.9)       | Best effort | **90 days**                  | Addressed opportunistically alongside other dependency work.                              |

**Exceptions.** A finding may be deferred beyond the SLA only when (a) it
is not reachable in this codebase (documented with a callsite analysis),
(b) no fixed version exists upstream, or (c) the fix would introduce a
worse regression. Each exception is recorded in the tracking issue with a
review date no more than 30 days out. — *ISO/IEC 27001 A.8.8, SOC 2 CC7.1,
OWASP A06:2021.*
