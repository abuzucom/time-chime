# Template drift

Local differences from the `abuzucom/agents` template. `DRIFT.md` defines the
record categories. Upstream adopter records live in `abuzucom/agents/adopters/`.
This file holds the adopting-repository side for `time-chime`.

The adopted template revision is upstream commit
`fc821061d0d6064ea2d4227b324470cffe487676` (2.51.0).

## Records

1. The canonical policy file is the upstream `AGENTS.md` at 2.51.0. The
   repository facts live in `docs/orientation.md`. The short orientation that
   the synchronized copies carry lives in `docs/project-orientation.md`. The
   assembled policy holds a 64 KiB limit, so the upstream policy documents
   leave 651 bytes for the adopter orientation.

2. Upstream rule 12 (non-root containers) is declined. This repository ships
   no Dockerfile, Compose file, or Kubernetes manifest. `AGENTS.md` rule 12
   names the decline and decodes the renumbering of upstream rules 13 through
   20 into local rules 12 through 19. `scripts/check_dockerfile_root.py`
   remains vendored for gate-adoption completeness and activates only when a
   matching container file appears.

3. Upstream rule 15 (cloud and infrastructure access) is scoped. `wrangler`
   non-destructive operations run without a prompt. Destructive and
   state-changing operations route to consent. Detail lives in `AGENTS.md`
   rule 14 and `docs/agent-policy/security.md`.

4. `scripts/trusted-gh.mjs` is maintained as a Node port of
   `scripts/trusted_gh.py`. The Python wrapper remains the canonical gated
   path. The Node port covers contexts without Python. Every upstream fix to
   the Python wrapper requires a backport on the Node port.

5. Repository-owned tooling runs alongside the vendored policy tooling:
   `scripts/check-headers.mjs`, `scripts/check-action-pins.mjs` with its
   `--fix` mode and `action-pin-autofix.yml` workflow, and the
   `replay-fuzz-failure.mjs` and `report-fuzz-failure.mjs` fuzz tooling.
   Vendored `scripts/check_action_pins.py` stays for policy parity.

6. CI workflows are expected to differ. The vendored `sync-check.yml`,
   `agents-compliance.yml`, `agents-md-compliance.yml`,
   `immutable-conflict-check.yml`, `gate-integrity.yml`, and
   `policy-size-report.yml` sit beside repository workflows.

7. The application commands run under bun. The shared command execution gate
   denies every bun invocation as opaque execution. The `Makefile` carries
   the route that an agent uses: `make test` and `make lint`. The repository
   test `tests/test_bun_command_denial.py` covers the denial.

8. The `CHANGELOG.md` merges the entries of every release that shares a UTC
   day under the newest version of that day. The upstream rule requires one
   entry per day. The merge keeps the absorbed version numbers in the entry
   text.

9. The pull request reviews run from `abuzucom/agents-personas`. The
   repository holds its own callers in `security-review-pr.yml`,
   `quality-review-pr.yml`, `generay-time-review-pr.yml`, and
   `persona-review-labels.yml`. The upstream self-review callers and the
   upstream release tooling stay in the source repository.

10. The local path gate carries an empty `.local-path-allowlist`. The
    template upgrade replaced the repository test that held the only finding,
    so the gate reports no finding.

11. `hooks/trusted-owners.txt` names `abuzucom`. The origin owner of this
    repository runs the test runners without a prompt.

12. `hooks/workflow-scripts.local.txt` holds no entry. The repository runs
    the shared policy tooling and the application commands through the
    `Makefile`.

13. The upstream source-repository files stay in the source repository:
    `scripts/release.py`, `.github/workflows/release.yml`, the release tests,
    `docs/agent-policy/source-orientation.md`, `policy-digests.json`, and the
    upstream self-review callers.

14. The policy workflows pin `actions/setup-python@6d4fd22b` (6.3.0). The
    template pins `actions/setup-python@a26af69be` (5.6.0), a release from
    2025-04-24 that targets Node 20. The repository moved to the newer
    release in pull request 106. `scripts/check_compliance_tree.py` approves
    both revisions, and `tests/test_trusted_python_pin.py` states that
    contract.

15. The prose file list names the repository own documents. The template
    list names `docs/pr-security-review.md` and `adopters/*.md`, which belong
    to the source repository. `scripts/check_agent_prose_gate.py`,
    `.github/workflows/sync-check.yml`, and the `Makefile` carry the
    repository list.

## Known environment limits

Five upstream tests create a symbolic link in a temporary directory. A
Windows account without the symlink privilege fails those fixtures with
`WinError 1314`. The upstream README asks for one elevated session to
confirm the diagnosis and forbids weakening the tests. The continuous
integration runs on Linux and covers the same fixtures.
