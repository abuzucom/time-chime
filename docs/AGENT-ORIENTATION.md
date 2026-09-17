# Repository orientation

Repository sections kept out of `AGENTS.md`. The shared canonical policy
limit is 32 KiB, so they live here instead.

Time-chime is a standalone TanStack Start clock app: React 19, Vite 8,
deployed as a Nitro bundle with the default `cloudflare-module` preset.
Swap `preset` in `vite.config.ts` for `node-server`, `vercel`, or `netlify`
to deploy elsewhere. Styling uses Tailwind CSS 4, Radix UI, and
shadcn-style components (`components.json`).

## Commands

- Install: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build` (`bun run build:dev` for development mode)
- Lint: `bun run lint`
- Format: `bun run format`
- Test: `bun run test`
- Suites: `test:headers`, `test:clickjacking`,
  `test:error-page-clickjacking`, `test:csp-hash`, `test:consent`,
  `test:https-guard-host`, `test:https-guard-fuzz`,
  `test:security-headers-e2e`, `test:time-provider`, `test:trusted-gh`
- Header/CSP check: `bun run check:headers`
- GitHub Actions pin check: `bun run check:action-pins` (`node
scripts/check-action-pins.mjs --fix` resolves and rewrites violations;
  `.github/workflows/action-pin-autofix.yml` opens a draft PR)
- Fuzz tooling: `fuzz:replay`, `fuzz:report`
- Policy copies: `python scripts/sync.py` (with `--check` or
  `--check-shared`)
- Gate adoption: `python scripts/check_gate_adoption.py`
- Policy test suite: `python scripts/run_tests.py`
- GitHub operations: `python scripts/trusted_gh.py run <gh arguments>`
- Bounded Git state: `python scripts/read_git_state.py all`

Python 3 supplies the policy tooling. The app itself uses only bun and
Node. Install checker dependencies with
`python -m pip install -r requirements-checkers.txt`. Makefile targets
`sync`, `check`, `changelog`, `lint`, `test`, and `identity` cover the same
ground for make users.

## Architecture

- `src/routes` — file-based routes. `src/routes/api/public/*` is the only
  externally callable contract; treat its request and response shapes as
  versioned under `AGENTS.md` Rule 6.
- `src/components` — UI components, including clock `faces`
- `src/lib` — domain logic: `chimes`, `time`, `native`, `browser`, `http`,
  `pwa`
- `scripts/` — Node `.mjs` app tooling (headers, action pins, fuzz)
  alongside the vendored Python policy toolchain adopted from
  `abuzucom/agents`
- `hooks/` — vendored Python gate hooks registered in
  `.claude/settings.json`, `.codex/`, `.gemini/`, and `.agents/`
- `tests/` — Node test runner app suites alongside Python policy suites
- `docs/` — architecture, compliance, security, operations;
  `docs/agent-policy/` holds the vendored supporting policy documents

## Guardrails

- Never hand-edit build output (`dist/`, `.output/`, `.vinxi/`), `bun.lock`,
  `public/` generated assets, or the synchronized policy copies
  (`CLAUDE.md`, `GEMINI.md`, `CONVENTIONS.md`, `.cursorrules`,
  `.clinerules`, `.windsurfrules`, `.copilot-instructions`,
  `.github/copilot-instructions.md`). Regenerate copies with
  `python scripts/sync.py`.
- `shared-files.json` regenerates only through
  `python scripts/sync.py --write-shared` during a coordinated shared-file
  change.
- `bun.lock` regenerates through `bun install` after an authorized
  `package.json` change.
- `.claudeignore` excludes `.env*` while allowing `.env.example`.
- Security-hardening is the central concern: CSP, security headers,
  clickjacking defenses, ZAP baseline scanning. Read the matching workflow
  in `.github/workflows/` (`security-headers.yml`, `zap-baseline.yml`,
  `fuzz-https-guard.yml`, `nightly-header-drift.yml`, `dependency-audit.yml`)
  before touching headers, CSP, or time-sync logic. The app has no database
  and does no server-side rendering of user content
  (`docs/SECURITY-TOP10.md`).
- Async discipline: cancel superseded work with `AbortController`, clear an
  existing `setInterval` or `setTimeout` before starting a replacement, and
  let a request ID or timestamp decide between two writers. See
  `src/lib/time/TimeSyncContext.tsx`.
- Logging: `src/routes/api/public/csp-report.tsx` treats every incoming
  field as untrusted and truncates before logging. Mirror that pattern for
  future user-supplied values.
- Read `docs/` and `SECURITY.md` before touching architecture or security
  behavior.
- `.prettierrc` sets `printWidth: 100` for formatted languages.

## Version and theme change checklist

- Bump `package.json` per SemVer with every change: patch for compatible
  fixes and UI changes, minor for compatible features. Major changes need
  explicit approval and an `AGENTS.md` Rule 6 stop.
- Treat `package.json` as the sole application version source. Use
  `__APP_VERSION__` for UI displays. Never hard-code a second version
  value. Verify the displayed version equals `package.json`.
- Test time-sensitive and theme-sensitive UI changes in light, dark, and
  grey modes.
