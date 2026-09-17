# Template drift

Local differences from the `abuzucom/agents` template. `DRIFT.md` defines the
record categories. Upstream adopter records live in `abuzucom/agents/adopters/`.
This file holds the adopting-repository side for `time-chime`.

## Records

1. Upstream rule 12 (non-root containers) is declined. This repository ships
   no Dockerfile, Compose file, or Kubernetes manifest. `AGENTS.md` rule 12
   names the decline and decodes the renumbering of upstream rules 13 through
   20 into local rules 12 through 19. `scripts/check_dockerfile_root.py`
   remains vendored for gate-adoption completeness and activates only when a
   matching container file appears.

2. Upstream rule 15 (cloud and infrastructure access) is scoped. `wrangler`
   non-destructive operations run without a prompt. Destructive and
   state-changing operations route to consent. Detail lives in `AGENTS.md`
   rule 14 and `docs/agent-policy/security.md`.

3. `scripts/trusted-gh.mjs` is maintained as a Node port of
   `scripts/trusted_gh.py`. The Python wrapper remains the canonical gated
   path. The Node port covers contexts without Python. Every upstream fix to
   the Python wrapper requires a backport on the Node port.

4. Repository-owned tooling runs alongside the vendored policy tooling:
   `scripts/check-headers.mjs`, `scripts/check-action-pins.mjs` with its
   `--fix` mode and `action-pin-autofix.yml` workflow, and the
   `replay-fuzz-failure.mjs` and `report-fuzz-failure.mjs` fuzz tooling.
   Vendored `scripts/check_action_pins.py` stays for policy parity.

5. `.editorconfig` sets a global indent of 2 with Python at 4 to match the
   repository Prettier configuration. Settings files remain
   repository-owned by design.

6. CI workflows are expected to differ. The vendored `sync-check.yml`,
   `agents-compliance.yml`, `agents-md-compliance.yml`, and
   `immutable-conflict-check.yml` sit beside repository workflows.

7. `scripts/check_changelog.py` accepts the legacy spaced-hyphen heading
   form during range-check version extraction. This repository migrated its
   CHANGELOG headings to the parenthesized form in 0.6.0, and range checks
   compare across the migration. Current-file validation still requires the
   parenthesized form. Candidate for upstreaming.
