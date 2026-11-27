# Template drift

Local differences from the `abuzucom/agents` template. `DRIFT.md` defines the
record categories. Upstream adopter records live in `abuzucom/agents/adopters/`.
This file holds the adopting-repository side for `time-chime`.

The adopted template revision is upstream commit
`fc821061d0d6064ea2d4227b324470cffe487676` (2.51.0). The canonical policy
file is the upstream `AGENTS.md` from that revision. The repository declines
no upstream rule. Rule 12 covers non-root containers, and the repository ships
no container file. The matching check never fires.

## Records

1. The repository facts live in `docs/orientation.md`. The short orientation
   that the synchronized copies carry lives in `docs/project-orientation.md`.
   The assembled policy holds a 64 KiB limit. The upstream policy documents
   leave 651 bytes for the adopter orientation.

2. The repository maintains `scripts/trusted-gh.mjs` as a Node port of
   `scripts/trusted_gh.py`. The Python wrapper remains the canonical gated
   path. The Node port covers contexts without Python. Every upstream fix to
   the Python wrapper requires a backport on the Node port.

3. Repository-owned tooling runs alongside the vendored policy tooling:
   `scripts/check-headers.mjs`, `scripts/check-action-pins.mjs` with its
   `--fix` mode and `action-pin-autofix.yml` workflow, and the
   `replay-fuzz-failure.mjs` and `report-fuzz-failure.mjs` fuzz tooling.
   Vendored `scripts/check_action_pins.py` stays for policy parity.

4. The CI workflows differ by design. The vendored `sync-check.yml`,
   `agents-compliance.yml`, `agents-md-compliance.yml`,
   `immutable-conflict-check.yml`, `gate-integrity.yml`, and
   `policy-size-report.yml` sit beside repository workflows.

5. The application commands run under bun. The shared command execution gate
   denies every bun invocation and recognizes only the Makefile targets
   `sync`, `check`, `lint`, `test`, and `identity`. An agent runs the
   application suites through `make test` and the application lint through
   `make lint`. The repository test `tests/test_bun_command_denial.py` covers
   the denial.

6. The `CHANGELOG.md` merges the entries that share a UTC day under the
   newest version of that day. The absorbed version numbers stay in the entry
   text.

7. The pull request reviews run from `abuzucom/agents-personas`. The
   repository holds its own callers in `security-review-pr.yml`,
   `quality-review-pr.yml`, `generay-time-review-pr.yml`, and
   `persona-review-labels.yml`. The upstream self-review callers and the
   upstream release tooling stay in the source repository.

8. The local path gate carries an empty `.local-path-allowlist`. The
   template upgrade replaced the repository test that held the only
   finding. The gate reports no finding.

9. `hooks/trusted-owners.txt` names `abuzucom`. The repository owner runs
   the test runners without a prompt.

10. `hooks/workflow-scripts.local.txt` holds no entry. The repository runs
    the shared policy tooling and the application commands through the
    `Makefile`.

11. The upstream source repository keeps its own files. The list covers
    `scripts/release.py`, `.github/workflows/release.yml`, the release tests,
    `docs/agent-policy/source-orientation.md`, `policy-digests.json`, and the
    upstream self-review callers.

12. The policy workflows pin `actions/setup-python@6d4fd22b` (6.3.0). The
    template pins `actions/setup-python@a26af69be` (5.6.0), a revision from
    2025-04-24 that targets Node 20. The repository moved to the newer
    revision in pull request 106. `scripts/check_compliance_tree.py` approves
    both revisions, and `tests/test_trusted_python_pin.py` states that
    contract.

13. The prose file list names the repository own documents. The template
    list names `docs/pr-security-review.md` and `adopters/*.md`. Those files
    belong to the source repository. `scripts/check_agent_prose_gate.py`,
    `.github/workflows/sync-check.yml`, and the `Makefile` carry the
    repository list.

14. `scripts/check_merge_safety.py` resolves the merge target before the
    comparison. The template compares the target string with the current
    branch without a resolution step.

15. `tests/test_policy_marker_names.py` accepts the absence of
    `docs/agent-policy/source-orientation.md`. The template test requires that
    source repository file.

## Known environment limits

Five upstream tests create a symbolic link in a temporary directory. A
Windows account without the symlink privilege fails those fixtures with
`WinError 1314`. The upstream README asks for one elevated session to
confirm the diagnosis and forbids weakening the tests. The continuous
integration runs on Linux and covers the same fixtures.
