# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-07-12

### Fixed

Retrospective `AGENTS.md` conformance pass, part 3 of 3:

- `src/lib/http/pre-hydration.ts`: justified the two empty `catch {}`
  blocks in the pre-hydration script with a one-line comment, and
  recomputed `PRE_HYDRATION_SCRIPT_SHA256` to match.
- Added missing doc comments to `DriftPanelBody` and `Sparkline` in
  `src/components/TimeSyncBadge.tsx`.
- Renamed the poorly-named `c` variable to `controller` throughout
  `src/lib/native/consent.test.ts`.
- `.gitignore`: added an explicit `.env*` / `!.env.example` pattern,
  matching `.claudeignore`'s existing convention (defense in depth; no
  `.env` file is tracked).

## [0.2.3] - 2026-07-12

### Fixed

Retrospective `AGENTS.md` conformance pass, part 2 of 3:

- Extracted the fuzz-redirect verification logic duplicated across
  `tests/https-guard-fuzz.test.mjs`, `scripts/replay-fuzz-failure.mjs`, and
  `scripts/report-fuzz-failure.mjs` into a shared
  `scripts/lib/verify-https-redirect.mjs` module.

## [0.2.2] - 2026-07-12

### Fixed

Retrospective `AGENTS.md` conformance pass, part 1 of 3 (audited by three
parallel codebase reviews; full findings in the originating PR's description):

- `eslint.config.js`: fixed the composition-over-inheritance lint rule
  incorrectly flagging classes with no `extends` clause at all, and
  extended AGENTS.md-mapped lint coverage to `scripts/*.mjs` and
  `tests/*.mjs` (previously `.ts`/`.tsx` only).
- Reduced nesting depth in `src/lib/native/notifications.ts`,
  `src/lib/time.functions.ts`, `src/routes/api/public/csp-report.tsx`,
  and `scripts/update-zap-report.mjs` (the last one surfaced by the new
  `.mjs` lint coverage above).

## [0.2.1] - 2026-07-12

### Fixed

- `67b6d73` Fixed the long-broken "Validate response headers" CI check
  (it ran `wrangler pages dev` against an app that actually deploys as a
  Cloudflare Worker, not Pages) and, while verifying that fix, found and
  fixed two related production bugs: `vite-plugin-pwa`'s service worker
  output landing in the wrong directory (404ing in production), and
  several security headers (`Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`,
  `Cache-Control`, `Vary`) silently missing from every SSR/server-function
  response.
- `b40fcc0` Removed all remaining Lovable scaffold traces (`.lovable/`,
  doc mentions, code comments) with no functional behavior change.

## [0.2.0] - 2026-07-11

### Added

- Version marker in the Settings drawer, reading `package.json`'s `version`
  via a Vite build-time define (`__APP_VERSION__`).

## [0.1.0] - 2026-07-11

Baseline release: retroactively covers every commit on `main` up to and
including this entry, newest first.

- `4e3348d` Merge pull request #26 from abuzucom/claude/agents-upstream-sync-u5v0w8
- `fef4eee` Sync AGENTS.md with updated abuzucom/agents upstream
- `d67a777` antigravity fix
- `232680a` Merge pull request #25 from abuzucom/claude/integrate-agents-repo-tnb4b8
- `393e8cf` Regenerate bun.lock and reconcile Dependabot major bumps
- `feec227` Integrate abuzucom/agents AI-coding-agent conventions
- `409df40` Merge pull request #24 from abuzucom/claude/fs-extra-symlink-fix-l1xq14
- `80eee75` Pin transitive fs-extra to 11.3.6 to fix symlink self-copy bug
- `e275819` Merge pull request #1 from abuzucom/dependabot/github_actions/google/osv-scanner-action-2.3.8
- `f24c915` Merge pull request #9 from abuzucom/dependabot/npm_and_yarn/react-day-picker-10.0.1
- `51cc437` Merge pull request #7 from abuzucom/dependabot/npm_and_yarn/typescript-6.0.3
- `bf4f8fb` chore(deps)(deps): bump react-day-picker from 9.14.0 to 10.0.1
- `07abeaf` Merge pull request #14 from abuzucom/dependabot/npm_and_yarn/globals-17.7.0
- `617dc50` Merge pull request #12 from abuzucom/dependabot/npm_and_yarn/recharts-3.9.2
- `7d8c225` Merge pull request #15 from abuzucom/dependabot/npm_and_yarn/lucide-react-1.23.0
- `6629b8a` Merge pull request #22 from abuzucom/dependabot/github_actions/actions/setup-node-6
- `5226dc4` chore(actions): bump actions/setup-node from 4 to 6
- `b61219a` Merge pull request #19 from abuzucom/fix/aikido-security-sast-60935109-2tsc
- `574f27e` chore(deps-dev)(deps-dev): bump typescript from 5.9.3 to 6.0.3
- `df717ec` Merge pull request #21 from abuzucom/fix/aikido-security-update-packages-60937176-c1pw
- `9c3a817` fix(security): update zod from 3.25.76 to 4.4.3
- `08a170b` Merge pull request #20 from abuzucom/fix/aikido-security-update-packages-60936236-rcfa
- `8f59c8f` fix(security): update enhanced-resolve from 5.20.1 to 5.22.1
- `429e384` fix(security): autofix Potential file inclusion attack via reading file
- `bcdc7ea` Merge pull request #4 from abuzucom/dependabot/github_actions/github/codeql-action-4
- `092c07d` Merge pull request #18 from abuzucom/fix/aikido-security-sast-60933446-omcj
- `dc6ca85` fix(security): autofix Overly Broad Permissions in GitHub Actions Workflows is risky
- `dd4d485` Merge pull request #17 from abuzucom/fix/aikido-security-sast-60930671-t85y
- `41622c9` Merge pull request #16 from abuzucom/fix/aikido-security-sast-60930417-ms38
- `306a13a` fix(security): autofix 3rd party Github Actions should be pinned
- `35b5b06` fix(security): autofix Template Injection in GitHub Workflows Action
- `17a4d9b` chore(deps)(deps): bump lucide-react from 0.575.0 to 1.23.0
- `1226aa4` chore(deps-dev)(deps-dev): bump globals from 15.15.0 to 17.7.0
- `938af4d` chore(deps)(deps): bump recharts from 2.15.4 to 3.9.2
- `63decd6` chore(actions): bump github/codeql-action from 3 to 4
- `84f97f4` chore(actions): bump google/osv-scanner-action from 2.0.2 to 2.3.8
- `fadb67d` Init
