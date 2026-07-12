# SOC 2 & ISO/IEC 27001:2022 — Control Mapping

_Last reviewed: 2026-07-02_

> **This is not a certification.** This document maps controls implemented in
> this repository to the AICPA SOC 2 Trust Services Criteria and to
> ISO/IEC 27001:2022 Annex A. It does **not** attest that any organization
> operating this codebase is SOC 2 or ISO 27001 compliant. Certification
> requires an accredited external auditor and organizational controls
> (governance, HR, physical security, vendor management, evidence
> collection, board oversight) that live outside a codebase.
>
> Cells labelled **"Organizational — out of scope for the codebase"** are the
> controls an operator MUST implement themselves before pursuing certification.

Companion documents:

- [`SECURITY.md`](../SECURITY.md) — disclosure policy.
- [`docs/COMPLIANCE.md`](./COMPLIANCE.md) — application profile, operator checklist, dependency SLA.
- [`docs/SECURITY-TOP10.md`](./SECURITY-TOP10.md) — OWASP Top 10 (2021) self-review.

Legend:

- **Implemented** — control exists in this repo with a file / test to point at.
- **Partial** — technical control in place; closing the loop requires an operator or an organizational policy.
- **Org — out of scope for the codebase** — the control cannot be satisfied by code and lives with the operator.
- **N/A** — no applicable surface in this app.

---

## SOC 2 — Trust Services Criteria

### Common Criteria (CC1 – CC9)

| Criterion | Topic | Status | Evidence in repo | Operator responsibility |
| --------- | ----- | ------ | ---------------- | ----------------------- |
| CC1.1 – CC1.5 | Control environment: integrity, board oversight, org structure, competence, accountability | Org — out of scope | `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (if adopted) | Governance, hiring, training, disciplinary policy. |
| CC2.1 – CC2.3 | Communication of security objectives | Partial | `README.md`, `SECURITY.md`, `docs/COMPLIANCE.md`, `docs/SECURITY-TOP10.md`, this document; `/.well-known/security.txt` | Internal comms cadence, customer-facing status page. |
| CC3.1 – CC3.4 | Risk assessment | Partial | Threat model in `docs/COMPLIANCE.md`; SSRF allow-list in `src/lib/time.functions.ts`; dependency SLA in `docs/COMPLIANCE.md` | Formal periodic risk assessment with sign-off. |
| CC4.1 – CC4.2 | Monitoring of controls | Partial | CI runs typecheck, lint, tests, `npm audit`, OSV-Scanner, ZAP baseline; results attached to workflow runs | Human review of scan results; management reporting. |
| CC5.1 – CC5.3 | Control activities & separation of duties | Partial | Code review required (operator sets branch protection); protected `main`; signed commits recommended | Branch protection rules; segregation between developer and deployer roles. |
| CC6.1 | Logical access — provisioning | N/A (app) / Org | App has no accounts. | Hosting-account IAM, MFA. |
| CC6.2 – CC6.3 | Logical access — authentication & authorization | N/A (app) / Org | No auth surface. | Hosting-account SSO, MFA. |
| CC6.4 | Restrict physical access | Org | — | Provider attestation (Cloudflare SOC 2). |
| CC6.5 | Protect confidential information at rest | N/A | No data at rest. | — |
| CC6.6 | Protect against threats from outside the boundary | Implemented | HSTS, CSP, Permissions-Policy, Host-header guard (`src/lib/http/https-guard.ts`), burst limiter (`src/lib/http/burst-limiter.ts`) | Enable WAF + rate-limiting at the edge. |
| CC6.7 | Restrict transmission | Implemented | HSTS `preload`, `upgrade-insecure-requests`, no cleartext channels | TLS certificate rotation. |
| CC6.8 | Prevent introduction of unauthorized software | Implemented | Lockfile committed; `bunfig.toml` `minimumReleaseAge = 24h`; strict CSP (no third-party script origins) | Signed commits, protected `main`. |
| CC7.1 | Detection of vulnerabilities | Implemented | `npm audit` + OSV-Scanner daily; weekly ZAP baseline; documented SLA | Triage rotation. |
| CC7.2 | Monitor system components | Partial | Structured CSP-violation logging (`src/routes/api/public/csp-report.tsx`) | Log aggregation, retention, alerting at the edge. |
| CC7.3 – CC7.5 | Incident evaluation, response, recovery | Partial | Disclosure policy + response SLAs in `SECURITY.md` | Documented incident-response runbook, tabletop exercises. |
| CC8.1 | Change management | Implemented | Version-controlled; lockfile committed; releases tagged; CI gates | Change advisory process for production deploys. |
| CC9.1 – CC9.2 | Risk mitigation & vendor management | Partial | Deny-by-default CSP; least-privilege server functions; vendor list (Cloudflare + browser vendors) narrow by design | Vendor risk questionnaires; DPA execution. |

### Additional trust categories

| Category | Applies? | Notes |
| -------- | -------- | ----- |
| **Availability (A1)** | Org — out of scope for the codebase | The app is stateless and can be redeployed from source. Availability targets, SLA, and DR runbooks are operator-owned. Client-side PWA offline shell (`register-sw.ts`, Workbox precache) reduces user-visible impact of edge outages. |
| **Confidentiality (C1)** | N/A | No confidential customer data is collected or stored. |
| **Processing Integrity (PI1)** | Partial | Server functions use typed `zod` validators. Time-source responses are cross-checked (multiple providers, weighted median). Operator responsibility: monitor error rates. |
| **Privacy (P1 – P8)** | Partial | See below. |

### Privacy criteria (P1 – P8)

| Criterion | Topic | Status | Evidence |
| --------- | ----- | ------ | -------- |
| P1 Notice | Communicate privacy practices | Implemented | `/privacy` route, `/terms`, `/third-party-notices`, `/permissions` |
| P2 Choice & consent | User controls | Implemented | GPC / DNT honoured; sound & schedule opt-in; export & delete in Settings |
| P3 Collection | Limit collection | Implemented | Zero PII collected by the app or server |
| P4 Use, retention, disposal | Purpose limitation | Implemented | Preferences in `localStorage` only; Delete action in Settings |
| P5 Access | User access to their data | Implemented | Export JSON in Settings |
| P6 Disclosure to third parties | Restrict onward transfer | N/A | No third-party recipients |
| P7 Quality | Data accuracy | N/A | No collected data to keep accurate |
| P8 Monitoring & enforcement | Complaint handling | Partial | Contact in `SECURITY.md` / `/privacy`; operator responsibility for response ticketing |

---

## ISO/IEC 27001:2022 — Annex A

Annex A of the 2022 revision reorganised 114 controls into 93, grouped under
four themes: A.5 Organizational, A.6 People, A.7 Physical, A.8 Technological.
The two people/physical themes are almost entirely organizational and are
summarised at the section level rather than per-control.

### A.5 Organizational controls (37 controls)

| Control | Title | Status | Notes |
| ------- | ----- | ------ | ----- |
| A.5.1 | Policies for information security | Partial | `SECURITY.md`, `docs/COMPLIANCE.md`, this document. Operator: sign-off, review cadence. |
| A.5.2 – A.5.6 | Roles, segregation of duties, contact with authorities/special interest groups, information security in project management | Org — out of scope | Organizational appointments; not codified in-repo. |
| A.5.7 | Threat intelligence | Implemented | GitHub Security advisories subscribed; OSV-Scanner + Dependabot in CI. |
| A.5.8 | Information security in project management | Partial | PR review + CI gates. Operator: project intake checklist. |
| A.5.9 – A.5.11 | Inventory, acceptable use, return of assets | Org | Codebase inventory = `bun.lockb` + `package.json`. Physical asset tracking is organizational. |
| A.5.12 – A.5.14 | Classification, labelling, transfer of information | N/A | No classified data. |
| A.5.15 – A.5.18 | Access control policy, identity management, authentication information, access rights | N/A (app) / Org | App has no auth surface. Hosting-account IAM is operator-owned. |
| A.5.19 – A.5.22 | Supplier relationships | Partial | Vendor list is narrow (Cloudflare + npm ecosystem). Operator: DPA execution. |
| A.5.23 | Cloud services | Partial | Deployment targets documented (Cloudflare, Nitro presets). Operator: cloud-security addendum. |
| A.5.24 – A.5.28 | Incident management planning, assessment, response, learning, evidence collection | Partial | Disclosure policy + SLAs in `SECURITY.md`. Operator: runbook, tabletop exercises, evidence handling. |
| A.5.29 – A.5.30 | Continuity, ICT readiness | Org | Stateless app → redeploy from source. Operator: DR plan, RTO/RPO. |
| A.5.31 – A.5.34 | Legal, IP, records, privacy | Partial | `/privacy`, `/terms`, `/third-party-notices`, `LICENSE`. Operator: jurisdictional review. |
| A.5.35 | Independent review | Org | Operator: annual audit. |
| A.5.36 | Compliance with policies | Org | Operator: internal audit. |
| A.5.37 | Documented operating procedures | Partial | `docs/OPERATIONS.md`, `docs/MOBILE-QA.md`, `docs/ARCHITECTURE.md`. Operator-specific runbooks live with operator. |

### A.6 People controls (8 controls) — Org — out of scope for the codebase

Screening, terms of employment, awareness training, disciplinary process,
responsibilities on termination, confidentiality agreements, remote working
policy, and information-security event reporting. None of these can be
satisfied by code; all are operator responsibilities.

### A.7 Physical controls (14 controls) — Org — out of scope for the codebase

Physical security perimeters, entry controls, secure areas, protection
against environmental threats, equipment siting, cabling, maintenance,
disposal, clear-desk/clear-screen. These are inherited from the hosting
provider (Cloudflare's SOC 2 / ISO 27001 attestations) for the runtime,
and from the operator's office for developer workstations.

### A.8 Technological controls (34 controls)

| Control | Title | Status | Evidence in repo |
| ------- | ----- | ------ | ---------------- |
| A.8.1 | User endpoint devices | Org | — |
| A.8.2 | Privileged access rights | N/A (app) / Org | No app-level privileges; hosting IAM is operator-owned. |
| A.8.3 | Information access restriction | N/A | No stored data. |
| A.8.4 | Access to source code | Org | Operator: repo permissions, branch protection. |
| A.8.5 | Secure authentication | N/A (app) / Org | No auth surface. |
| A.8.6 | Capacity management | Partial | Body caps, burst limiter, stateless design. Operator: edge capacity. |
| A.8.7 | Protection against malware | Partial | Strict CSP; no third-party origins; `minimumReleaseAge`. Operator: developer workstation AV. |
| A.8.8 | Management of technical vulnerabilities | Implemented | `npm audit` + OSV-Scanner + Dependabot; SLA in `docs/COMPLIANCE.md`. |
| A.8.9 | Configuration management | Implemented | All configuration in-repo; no runtime mutability; `public/_headers` mirrored by `security-headers.ts` and verified in CI. |
| A.8.10 | Information deletion | Implemented | User "Delete my data" action in Settings; no server-side data to delete. |
| A.8.11 | Data masking | N/A | No collected data to mask. |
| A.8.12 | Data leakage prevention | Implemented | Zero-telemetry client; CSP report field allow-list; origin-only URL truncation in `csp-report.tsx`. |
| A.8.13 | Information backup | Org | Operator: hosting-provider backups; source in version control. |
| A.8.14 | Redundancy | Org | Operator: multi-region deploy if required. |
| A.8.15 | Logging | Partial | Structured `console.error` for CSP violations; no client telemetry. Operator: log aggregation & retention. |
| A.8.16 | Monitoring activities | Partial | Weekly ZAP baseline. Operator: uptime & error-rate monitoring. |
| A.8.17 | Clock synchronization | Implemented — **and it's the product**. Server functions and client use user-selected HTTPS JSON services; Stratum-1 authority and NTS authentication are not claimed. |
| A.8.18 | Use of privileged utility programs | N/A | None bundled. |
| A.8.19 | Installation of software on operational systems | Org | Operator: change management. |
| A.8.20 | Network security | Partial | HSTS + `upgrade-insecure-requests`; SSRF-safe fetch allow-list. Operator: WAF, DDoS. |
| A.8.21 | Security of network services | Org | Operator: WAF ruleset. |
| A.8.22 | Segregation of networks | N/A | No internal network; edge Worker only. |
| A.8.23 | Web filtering | Implemented | CSP `default-src 'self'`; no third-party script hosts allowlisted. |
| A.8.24 | Use of cryptography | Implemented | TLS-only transport; browser-native `SubtleCrypto` where crypto is needed. |
| A.8.25 | Secure development lifecycle | Implemented | Typed code, PR review, tests, CI gates, dependency pinning, `minimumReleaseAge`. |
| A.8.26 | Application security requirements | Implemented | Documented in `docs/SECURITY-TOP10.md` and this document. |
| A.8.27 | Secure system architecture & engineering | Implemented | `docs/ARCHITECTURE.md`; deny-by-default headers; nonce-based CSP. |
| A.8.28 | Secure coding | Implemented | ESLint, TypeScript strict, `zod` validators, no `eval`, no `dangerouslySetInnerHTML`. |
| A.8.29 | Security testing in development & acceptance | Implemented | Header, clickjacking, CSP-hash, HTTPS-guard fuzz, and E2E header tests under `tests/`. |
| A.8.30 | Outsourced development | Org | Operator responsibility. |
| A.8.31 | Separation of development, test, production | Partial | Preview vs published URLs (Cloudflare Pages); build modes. Operator: production access controls. |
| A.8.32 | Change management | Implemented | Version control, tagged releases, PR review. Operator: CAB if required. |
| A.8.33 | Test information | Implemented | No production data in tests; fixtures are synthetic. |
| A.8.34 | Protection of information systems during audit testing | Org | Operator: coordinate testing windows. |
