# Changelog

Every notable project change appears below.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Headings parenthesize the release date. The house style bans the spaced hyphen.

## [0.16.0] (2026-11-27)

### Added

- Adopt the `abuzucom/agents` template at upstream commit
  `fc821061d0d6064ea2d4227b324470cffe487676` (2.51.0). The change brings
  the shared gate files, the gate hooks, the agent skills, the client
  registrations, and the supporting policy documents.
- Add the gate hooks for anti-delegation, gate adoption, pull request base,
  MCP GitHub writes, single-question prompts, session workspaces, and prose
  options.
- Add the local path gate with an empty `.local-path-allowlist` and
  `hooks/trusted-owners.txt` naming `abuzucom`.

### Fixed

- Remove the `app-test` and `app-lint` Makefile targets. The shared command
  gate recognizes only `sync`, `check`, `lint`, `test`, and `identity`. The two
  removed targets met a denial for an uninspectable program. `make test` and
  `make lint` cover both suites.
- Regenerate `docs/template-drift.md` against the adopted 2.51.0 policy. The
  record described a rule decline and a renumbering that the adopted policy
  no longer carries.
- Resolve the merge target in `scripts/check_merge_safety.py` before the
  comparison. The template compares the target string with the current branch
  without a resolution step.

### Changed

- Replace the canonical policy file with the upstream `AGENTS.md`. The
  repository facts move to `docs/orientation.md`. The short orientation that
  the synchronized copies carry lives in `docs/project-orientation.md`.
- Route the application commands through the `Makefile`. The shared command
  gate denies every bun invocation as opaque execution. `make test` and
  `make lint` cover the policy suite and the application suites.
- Merge the changelog entries of every release that shares a UTC day under
  the newest version of that day. The absorbed version numbers stay in the
  entry text.
- Replace the client registrations for Claude Code, Codex, Gemini, and
  Antigravity with the upstream ones.
- Keep the repository setup-python pin at `6d4fd22b` (6.3.0) in the policy
  workflows. The checker approves that revision and the template revision.
- Name the repository own documents in the prose file list. The template
  list names files that belong to the source repository.

### Removed

- Remove the repository statement coverage test for the replaced hooks, the
  local `github-draft` skill, and the upstream tests that cover the source
  repository.

## [0.12.0] (2026-11-10)

The entry also covers the release 0.11.1.

### Added

- Adopt the pull request security review from `abuzucom/foucault` and the
  pull request quality review from `abuzucom/euler`. The vendored reusable
  workflows and the adapter scripts carry the foucault 3.7.6 and euler 0.7.1
  pins.
- Document the review automation in `docs/review-automation.md`.

### Fixed

- Run the settings-store tests in the CI coverage workflow.
- Restore the final newline in the trusted Python pin test file.
- Correct the settings loader docstring after the store migration.

## [0.11.0] (2026-11-09)

The entry also covers the releases 0.10.0, 0.9.0.

### Changed

- Use a subscribed settings store for initialization and updates.
- Update React hooks to satisfy lint checks for render purity and state.
- Accept the approved setup-python 7.1.0 pin in the immutable checker.

### Fixed

- Preserve persisted settings during initialization.

## [0.8.7] (2026-10-29)

### Changed

- Bump `actions/setup-node` from 7.0.0 to 7.1.0 in
  `.github/workflows/dependency-audit.yml`.
- Bump `actions/upload-artifact` from 7.0.1 to 7.0.2 in
  `.github/workflows/dependency-audit.yml`,
  `.github/workflows/fuzz-https-guard.yml`, and
  `.github/workflows/github-coverage.yml`.
- Bump `actions/download-artifact` from 8.0.1 to 8.0.2 in
  `.github/workflows/github-coverage.yml`.
- Bump `github/codeql-action/upload-sarif` from 4.38.2 to 4.39.0 in
  `.github/workflows/dependency-audit.yml`.
- Bump `google/osv-scanner-action/osv-scanner-action` from 2.6.0 to 2.7.0 in
  `.github/workflows/dependency-audit.yml`.
- Update expected action pins in `tests/test_workflow_security.py`.

### Fixed

- Correct the `actions/upload-artifact` version comment in
  `.github/workflows/fuzz-https-guard.yml`.

## [0.8.6] (2026-10-28)

### Added

- Add `tests/test_dependency_security_floors.py` to keep advisory-affected
  pins at or above the patched versions.
- Add `tests/test_bun_lockfile_workflow_consent.py` to check the bun
  lockfile consent route.

### Changed

- Route the exact `bun install --lockfile-only` command in
  `hooks/enforce_branch_name.py` to a consent prompt. Every other `bun`
  command stays denied.

## [0.8.5] (2026-10-26)

### Added

- Add `tests/test_dependency_audit_node.py` to check the audit Node major.

### Fixed

- Run the npm audit job in `.github/workflows/dependency-audit.yml` on
  Node 22. The `@tanstack/react-start` packages require Node 22.12.0 or
  later. The Node 20 job fails with an npm `edgesOut` error.

## [0.8.4] (2026-10-07)

The entry also covers the release 0.8.3.

### Added

- Add workflow action pin tests in `tests/test_workflow_security.py`.

### Changed

- Bump `actions/upload-code-coverage` from 1.4.1 to 1.4.4 in
  `.github/workflows/github-coverage.yml`.
- Bump `actions/download-artifact` from 4.3.0 to 8.0.1 in
  `.github/workflows/github-coverage.yml`.
- Bump `actions/upload-artifact` from 4.6.2 to 7.0.1 in
  `.github/workflows/github-coverage.yml`.
- Bump `github/codeql-action/upload-sarif` from 4.38.0 to 4.38.2 in
  `.github/workflows/dependency-audit.yml`.
- Bump `google/osv-scanner-action/osv-scanner-action` from 2.5.1 to 2.6.0 in
  `.github/workflows/dependency-audit.yml`.

### Fixed

- Align `package.json` version with `CHANGELOG.md`.
- Remove unused `base64`, `os`, and `block_destructive_bash` imports from
  `tests/test_hook_statement_coverage.py` to resolve the code quality
  findings.

## [0.8.2] (2026-10-02)

### Added

- Add hook statement coverage tests in `tests/test_hook_statement_coverage.py`.
- Add `python scripts/check_hook_coverage.py` to the static checks job in `.github/workflows/agents-compliance.yml`.
- Add additional JavaScript unit tests to `.github/workflows/github-coverage.yml`.

### Changed

- Reduce unreached hook functions in `hook-coverage-baseline.json` from 84 functions down to 60 functions.
- Add `test_branch_validation_contexts.py::BranchContextTest` to `PRIORITY_TEST_SHARDS` in `scripts/check_hook_coverage.py`.
- Update `docs/gate-threat-model.md` with newly covered hook functions and verified boundary limits.

## [0.8.1] (2026-09-28)

The entry also covers the releases 0.8.0, 0.7.0.

### Added

- Add TypeScript code coverage reporting to CI via Node.js test runner.

### Changed

- Consolidate dependency updates from pull requests 13, 65, 77, 80, 81, and 84 into a single release.
- Update `eslint-plugin-react-hooks` to 7.1.1.
- Update npm package dependencies and devDependencies across 57 packages.
- Update GitHub Actions workflow action pins:
  - `actions/checkout` to `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1).
  - `actions/setup-python` to `5fda3b95a4ea91299a34e894583c3862153e4b97` (v7.0.0).
  - `google/osv-scanner-action/osv-scanner-action` to `6e4298ebc4db23e847df9b2e2de2939d6f066c67` (v2.5.1).
  - `github/codeql-action/upload-sarif` to `b96794f015dfd88f77b49b1c93e0fa7110f94c63` (v4.38.0).

### Fixed

- Add explicit `contents: read` permissions block to `security-headers.yml`, resolving CodeQL alert #2 (`actions/missing-workflow-permissions`).
- Escape backslash characters before table pipe characters in `scripts/update-zap-report.mjs`, resolving CodeQL alert #3 (`js/incomplete-sanitization`).
- Pin Nitro `compatibilityDate` to `2026-09-13` in `vite.config.ts`. Nitro defaults to the current build date when unspecified, exceeding the newest date supported by `wrangler@4.132.0` in `security-headers.yml`.
- Fall back to binary buffer writes on `UnicodeEncodeError` in `scripts/trusted_gh.py` to prevent Windows cp1252 output encoding crashes.

## [0.6.3] (2026-09-16)

The entry also covers the releases 0.6.2, 0.6.1, 0.6.0.

### Added

- Vendored `abuzucom/agents` 2.0.30 (upstream commit
  d48643773171004ae36dfbed077ee1850a8e2016) as a whole gate ecosystem:
  Python hooks under `hooks/` (destructive-command gates for Bash,
  PowerShell, and CMD, test-consent, branch and identity enforcement,
  lifecycle policy re-injection, infrastructure file gate), Python checkers
  under `scripts/` (sync, gate adoption, changelog, policy size, prose
  policy, external PR references, conflict markers, compliance tree, hook
  coverage, `read_git_state.py`, `trusted_gh.py`, `trusted_git.py`), the
  `tests/` Python suite, `docs/agent-policy/` supporting documents,
  `shared-files.json` manifest, `Makefile`, `requirements-checkers.txt`,
  `.pre-commit-config.yaml`, `CONTRIBUTING.md.example`, and
  `SECURITY.md.example`.
- `.claude/settings.json`, `.codex/`, `.gemini/`, and `.agents/`
  registrations for the gate hooks.
- `.github/workflows/sync-check.yml`, `agents-compliance.yml`,
  `agents-md-compliance.yml`, and `immutable-conflict-check.yml` vendored
  from upstream. The last one runs an immutable compliance scan with a
  read-only token in a `pull_request_target` workflow.
- `scripts/trusted-gh.mjs` (`node scripts/trusted-gh.mjs run <gh
arguments>`), a Node port of `scripts/trusted_gh.py`: resolves `gh` outside
  the repository, verifies the authenticated account, injects validated
  `--repo` and `--head` targets, enforces the shared denylist, and denies
  unsafe `gh api` methods. Gated shell hooks recognize only the Python
  wrapper. The Node port covers contexts without Python.
  `tests/trusted-gh.test.mjs` supplies 28 behavioral tests.
- `.gitattributes` for the policy LF rule, `.editorconfig`,
  `docs/gate-threat-model.md`, `docs/template-drift.md`, `DRIFT.md`, GitHub
  issue and pull request templates, `plan/HANDOFF.md.example`, and
  `tools/hook-trace/`.
- New rules and sections: git identity verification, external-repository
  consent, whole-gate adoption, Git Credential Manager and browser token
  bans, Authorization and Precedence sections, lifecycle re-adoption, strict
  branch preflight, LF/UTF-8 policy, controlled vocabulary, the `ci` commit
  type, and parenthesized CHANGELOG dates.
- `bun run check:gate-adoption`, `bun run check:shared`, and
  `bun run test:policy` scripts.

### Changed

- `AGENTS.md` rewritten to upstream 2.0.30, keeping the sections that
  belong to this repository (Commands, Architecture, Do not touch, Gotchas,
  Read before touching, Version and theme checklist). Upstream rule 12 (non-root
  containers) stays pruned with the renumbering recorded in rule 12.
  Upstream rules 13 through 20 map to local rules 12 through 19.
- Rule 15 scoped for this repository. Non-destructive `wrangler` operations
  stay prompt-free. Destructive Cloudflare state changes require consent.
  Detail lives in `docs/agent-policy/security.md`.
- `scripts/check-persist-credentials.mjs`, `check-branch-name.mjs`,
  `check-banned-agents.mjs`, `sync-agent-docs.mjs`,
  `hooks/enforce-branch-name.mjs`, and the matching tests removed. Vendored
  Python equivalents replace the removed files. The local
  `agent-docs-sync.yml` came off too.
  The vendored `sync-check.yml` covers copy verification.
- `package.json` scripts re-pointed to the Python checkers. CHANGELOG
  headings switched to the parenthesized date form for every historical
  entry.
- README documents the Python 3 prerequisite for policy tooling.

### Fixed

- `security-headers.yml` upgrades the pinned wrangler from 4.110.0 to
  4.132.0. Nitro generates `compatibility_date` 2026-09-13, and 4.110.0's
  workerd supports dates only up to 2026-07-15. The header-check server
  could never start. The check failed on `main` from 2026-07-16.
- README prose and one legacy CHANGELOG line rewritten in ASCII without
  em/en dashes or spaced-hyphen substitutes, satisfying the vendored
  `check_ascii.py` blocking check.
- `scripts/check_changelog.py` accepts the legacy spaced-hyphen heading form
  during range-check version extraction. The 0.6.0 heading migration left
  base revisions unparseable. Every pull request failed the version advance
  check. Current-file validation still requires the parenthesized form.
  Recorded in `docs/template-drift.md`.
- `security-headers.yml` resolves and caches wrangler outside the server
  startup window and extends the wait loop to 60 seconds. Cold CI runners
  exhausted the 20-second loop on bunx downloads. The check failed on `main`
  from 2026-07-16.
- `src/lib/http/https-guard.ts` replaces the control-character regex with an
  equivalent code-unit comparison, clearing the latent `no-control-regex`
  eslint error. The header validation behavior stays unchanged.
- `tests/clickjacking-defences.test.mjs` normalizes route paths to forward
  slashes and accepts the current `head(options)` signature. The suite now
  passes on Windows.
- `.prettierignore` now excludes generated policy copies and vendored
  `abuzucom/agents` content. The `bun run format` command can no longer
  desynchronize the copies.
- `bun run format` applied across drifted repo-owned files. `bun run lint`
  now exits clean (warnings remain).
- Superseded Node checkers (`check-banned-agents.mjs`,
  `check-branch-name.mjs`, `check-persist-credentials.mjs`,
  `sync-agent-docs.mjs`) and the matching tests removed for real. A revert
  pass in the 0.6.0 branch had restored the files before the adoption commit.

## [0.5.0] (2026-08-20)

### Added

- `scripts/check-persist-credentials.mjs` (`bun run check:persist-credentials`),
  a Node port of `abuzucom/agents` `check_persist_credentials.py`, enforcing new
  rule 11. An `actions/checkout` step must set `persist-credentials: false`
  unless the job needs the credential afterward.
- `scripts/check-branch-name.mjs` (`bun run check:branch-name`), enforcing the
  `<type>/<kebab-description>` branch convention and the new `claude/` ban.
- `scripts/check-banned-agents.mjs` (`bun run check:banned-agents`), matching
  commit author, committer, and `Co-authored-by` trailers, plus the pull request
  author login, against the Banned agents denylist. This replaces an unbacked
  claim. `AGENTS.md` previously said that CI enforced the section when no
  such check existed.
- `hooks/enforce-branch-name.mjs` and `.claude/settings.json`, wiring the branch
  check into Claude Code. `SessionStart` injects a stop-and-rename instruction;
  `PreToolUse` exits 2 on `git commit` or `git push` from a non-conforming
  branch. The split exists because Claude Code ignores a non-zero `SessionStart`
  exit. `git branch -m` is never blocked.
- `.github/workflows/agents-compliance.yml`, running all three checkers and
  the matching unit tests on every pull request. The upstream reusable
  workflow is not referenced. Upstream has cut no release tag, and rule 9 forbids
  `@main`.
- 42 unit tests across `tests/check-persist-credentials.test.mjs`,
  `tests/check-banned-agents.test.mjs`, and `tests/enforce-branch-name.test.mjs`,
  the last including a group asserting `.claude/settings.json` still registers
  the hook for both events. No new dependency arrives. All use `node --test`.

### Changed

- Synced `AGENTS.md` (and its six fanned-out copies) with `abuzucom/agents`
  1.11.0. Added critical rule 10 (verify state before assuming workflow intent),
  rule 11 (no persisted git credentials in CI), and rule 12 (back enforcement
  claims with real checks). Extended rule 9 to cover pinning reusable workflows
  referenced with `uses:`. The upstream rule 12, non-root containers, stays
  pruned. This repository ships no Dockerfile, compose file, or Kubernetes
  manifest. Upstream rule 13 becomes local rule 12.
- Branch naming conventions now ban the `claude/` prefix. A name that the
  harness or the dispatcher assigns is no exception. A rename follows before
  the first commit. Dependabot stays exempt.
- Set `persist-credentials: false` on six `actions/checkout` steps.
  `zap-baseline.yml` and `action-pin-autofix.yml` both push. Both carry the
  rule 11 exception comment instead.
- `eslint.config.js` now lints `hooks/**/*.mjs` under the same rules already
  applied to `scripts/` and `tests/` Node ESM files.

## [0.4.2] (2026-07-16)

### Changed

- Synced `AGENTS.md` (and its fanned-out copies) with the `abuzucom/agents` 1.1.0
  upstream conventions, adapted to the TypeScript and ESLint idioms of this
  repository. Added a "No suppressing checks" workflow rule (no
  `eslint-disable`/`@ts-ignore`/`@ts-expect-error` or CI weakening). Added a
  "History safety" rule against rewriting pushed history without consent.
  Merged the run-on-sentence prohibition into the em and en dash style rule.
  Renamed "No extended ASCII" to "No non-ASCII characters" with tightened
  wording. Expanded the incomplete-work-marker rule beyond TODO and FIXME to
  XXX, HACK, stubs, and bare placeholders.
- Extended the `no-warning-comments` ESLint rule terms to `xxx` and `hack` (alongside `todo`/`fixme`) to back the expanded incomplete-work-marker convention. No new dependency.

## [0.4.1] (2026-07-13)

The entry also covers the release 0.4.0.

### Added

- `scripts/check-action-pins.mjs` (`bun run check:action-pins`) to detect GitHub Actions referenced by a mutable tag instead of a pinned commit SHA, with a `--fix` mode that resolves and rewrites the references.
- `.github/workflows/action-pin-autofix.yml`, a scheduled/push-triggered
  workflow that runs the fixer and opens a draft PR when it finds unpinned
  actions. The workflow stays off `pull_request` and `pull_request_target`.
  No write-scoped token executes against fork-controlled workflow content.

### Changed

- `security-headers.yml` now always prints the local `wrangler dev` server's own
  log (including any unhandled SSR exception stack trace) as a collapsed CI
  group. An intermittent 500 on the header-check probes then surfaces the actual
  error instead of just "HTTP 500". The change stays diagnostic. It changes
  neither the app behavior nor the check outcome.
- Pinned every remaining mutable-tag `uses:` reference across `.github/workflows/*.yml` (13 lines, 6 workflows) to a commit SHA with a version comment, matching the convention already used for `zaproxy/action-baseline` and `oven-sh/setup-bun`. Includes adopting `actions/checkout` v7.0.0 and `actions/github-script` v9.0.0 (superseding PRs #2 and #3).

## [0.3.3] (2026-07-12)

The entry also covers the releases 0.3.2, 0.3.1, 0.3.0, 0.2.6, 0.2.5, 0.2.4, 0.2.3, 0.2.2, 0.2.1.

### Changed

- Removed WorldTimeAPI and timeapi.world from the selectable time-provider set while keeping the rest of time sync intact.
- Defaulted saved provider state to the remaining providers when the code
  filters out obsolete IDs.
- Updated the provider tests and user-facing copy to reflect the narrower network-time set.
- Reframed time synchronization around selectable HTTPS JSON reference services.
- Removed Stratum-1, NTS, and provider-provenance claims from the application UI.
- Added educational guidance about authoritative Stratum-1 timekeeping and NTS.
- Added a theme-aware GitHub repository badge to the footer.
- Used a build-safe inline GitHub mark compatible with the pinned icon dependency.
- Renamed the home-page Settings link to FAQ and aligned its version with `package.json`.
- Styled the Support the developers link consistently with the FAQ link.
- Added explicit agent guidance for SemVer and theme-aware UI changes.
- Pinned all 76 `^`-range `package.json` dependencies/devDependencies to
  the currently-resolved exact versions from `bun.lock` (AGENTS.md rule
  9: "pin versions"). Verified `bun install` produces no lockfile changes
  beyond the version-string echo in the workspace declaration. No
  package's resolved version shifted.

### Fixed

- Treat provider failures as an unavailable reference instead of a successful local-time sync.
- Restore immediate retry behavior after a failed initial or manual sync.
- Allow fixed HTTPS providers to follow redirects and accept valid JSON responses without a content-type gate.
- Keep drift status neutral when no network reference is available.
- Hardened provider selection against stale persisted IDs and update races.
- Synced immediately against the newly selected provider list.
Retrospective `AGENTS.md` conformance pass, part 3 of 3:
- `src/lib/http/pre-hydration.ts`: justified the two empty `catch {}`
  blocks in the pre-hydration script with a one-line comment, and
  recomputed `PRE_HYDRATION_SCRIPT_SHA256` to match.
- Added missing doc comments to `DriftPanelBody` and `Sparkline` in
  `src/components/TimeSyncBadge.tsx`.
- Renamed the poorly-named `c` variable to `controller` throughout
  `src/lib/native/consent.test.ts`.
- `.gitignore`: added an explicit `.env*` / `!.env.example` pattern,
  matching the existing `.claudeignore` convention. The change adds defense in
  depth. No `.env` file enters version control.
Retrospective `AGENTS.md` conformance pass, part 2 of 3:
- Extracted the fuzz-redirect verification logic duplicated across
  `tests/https-guard-fuzz.test.mjs`, `scripts/replay-fuzz-failure.mjs`, and
  `scripts/report-fuzz-failure.mjs` into a shared
  `scripts/lib/verify-https-redirect.mjs` module.
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
- `67b6d73` Fixed the long-broken "Validate response headers" CI check
  (it ran `wrangler pages dev` against an app that actually deploys as a
  Cloudflare Worker, not Pages) and, while verifying that fix, found and
  fixed two related production bugs: `vite-plugin-pwa`'s service worker
  output landing in the wrong directory (404ing in production), and
  several security headers (`Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`,
  `Cache-Control`, `Vary`) missing from every SSR and server-function
  response.
- `b40fcc0` Removed all remaining Lovable scaffold traces (`.lovable/`,
  doc mentions, code comments) with no functional behavior change.

## [0.2.0] (2026-07-11)

The entry also covers the release 0.1.0.

### Added

- Version marker in the Settings drawer, reading `package.json`'s `version`
  via a Vite build-time define (`__APP_VERSION__`).
