# Security Policy

_Last reviewed: 2026-07-02_

Time Chime is a client-side clock and chime application. It has **no user
accounts, no backend user data, no third-party analytics or trackers, and no
personal information leaves the device** beyond the anonymous HTTPS requests
issued to the user's chosen stratum-1 time providers. Every user preference is
persisted in the browser's `localStorage`.

We take security seriously and welcome coordinated disclosure.

## Supported versions

| Version           | Supported |
| ----------------- | :-------: |
| `main` branch     |     ✅    |
| Latest tagged release | ✅   |
| Older releases    |     ❌    |

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, not via public issues:

- Email: `security@<your-domain>` (PGP key on request), **or**
- GitHub → Security → *"Report a vulnerability"* (private advisory), **or**
- The equivalent private issue on GitLab.

Include:

1. A description of the issue and its impact.
2. Reproduction steps or a proof-of-concept.
3. Affected version / commit SHA.
4. Your name / handle for credit (optional).

**Response targets** (aligned with ISO/IEC 27035 and SOC 2 CC7.4 incident
management):

| Stage                        | Target                        |
| ---------------------------- | ----------------------------- |
| Acknowledge receipt          | 3 business days               |
| Initial triage & severity    | 7 business days               |
| Fix or documented mitigation | 30 days (critical: 7 days)    |
| Public advisory              | Coordinated with the reporter |

Please do not exploit findings beyond what is necessary to demonstrate them,
do not access data that is not yours, and do not run automated scanners
against hosted infrastructure without prior written permission.

## Machine-readable disclosure

A [`security.txt`](./public/.well-known/security.txt) is served at
`/.well-known/security.txt` per **RFC 9116**.

## Scope

**In scope**

- The application source in this repository.
- Vulnerabilities in the built artefacts we distribute (web, Android, iOS
  Capacitor wrappers).

**Out of scope**

- Vulnerabilities in third-party time providers (report to those operators).
- Vulnerabilities in the user's browser, OS, or device.
- Denial-of-service through resource exhaustion of a self-hosted deployment
  (the app is intended to run on the user's device).
- Reports from automated scanners with no proof-of-concept.

## Our security controls

The controls the codebase enforces today are documented in:

- [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) — application profile, shared-responsibility split, operator checklist, and dependency remediation SLA.
- [`docs/SECURITY-TOP10.md`](./docs/SECURITY-TOP10.md) — OWASP Top 10 (2021) self-review with per-item evidence.
- [`docs/COMPLIANCE-MAPPING.md`](./docs/COMPLIANCE-MAPPING.md) — SOC 2 Trust Services Criteria and ISO/IEC 27001:2022 Annex A control mapping.

These documents describe **implemented controls**. They are not certifications
and do not imply audit outcomes under any framework.

## Third-party dependency vulnerabilities

Reports about *dependencies* (advisories in packages we consume) are
handled through the automated pipeline described in
[`docs/COMPLIANCE.md` → Dependency remediation SLA](docs/COMPLIANCE.md#dependency-remediation-sla),
not this coordinated-disclosure inbox. If a public advisory is not yet
detected by our scanners, please still email us — we will file the
Dependabot / OSV exception and track it against the same SLA.
