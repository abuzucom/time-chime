# Pull request review automation

Two model driven reviews run on every pull request in this repository. A
security review applies the `abuzucom/foucault` audit policy. A code quality
review applies the `abuzucom/euler` quality policy. Each review posts a
report on the pull request and publishes a check run.

## What runs

| Workflow | Trigger | Check run |
| --- | --- | --- |
| `security-review-pr.yml` | The Immutable Compliance workflow completes | `security-review` |
| `quality-review-pr.yml` | The Convention Sync Check workflow and the Immutable Compliance workflow complete for the same head revision | `quality-review` |

The Immutable Compliance workflow is the privileged pull request scan in
`immutable-conflict-check.yml`. The Convention Sync Check workflow is the
pull request test run in `sync-check.yml`. The quality review starts only
when both runs succeeded for the same head revision. The review waits for
the test suite.

Both callers use the `workflow_run` trigger. GitHub runs a workflow run
workflow from the default branch alone. A pull request cannot edit the
reviewer.

## Pinned revisions

| Source | Version | Commit |
| --- | --- | --- |
| `abuzucom/foucault` | 3.7.6 | `6ca2829208e718afdd2402255c501c4a94b45b4f` |
| `abuzucom/euler` | 0.7.1 | `eb97d1fe7bfbfec97997a30846f78a57a6f2f2e3` |

The reusable workflows live in this repository so that the review code stays
under the repository own review and the repository own action pin rules.

| Path | Role |
| --- | --- |
| `.github/workflows/security-review.yml` | The security review implementation |
| `.github/workflows/quality-review.yml` | The quality review implementation |
| `.github/workflows/security-review-pr.yml` | The security review caller |
| `.github/workflows/quality-review-pr.yml` | The quality review caller |
| `ci/build_pr_case.py` | Builds the security review envelope from the pull request diff |
| `ci/call_model.py` | Sends the review request to the provider |
| `ci/run_model_command.py` | Runs the adapter command without a shell |
| `ci/model_providers.json` | The provider profiles for the security review |
| `scripts/check_pr_review_response.py` | Validates the security review report |

The security reusable workflow loads `AUDIT.md` from the pinned foucault
commit. The quality reusable workflow loads `QUALITY.md` and the euler
adapter from the pinned euler commit. This repository supplies no euler
adapter files.

## Provider

The active provider profile is Ollama with `kimi-k2.7-code`. A large review
routes to `minimax-m3.1-flash`. Both profiles read one credential.

The caller maps the `OLLAMA_API_KEY` repository secret to the `MODEL_API_KEY`
secret of the reusable workflow. The adapter reads the key from the
environment and fails before any request when the key is empty.

## Verdicts

The security review ends with a `VERDICT` line. The allowed tokens are
`APPROVE`, `BLOCK`, and `NEEDS-HUMAN`. The quality review ends with a
`VERDICT_JSON` companion line. Both callers set `fail_on_block`. A
blocking verdict fails the job and the check run reports the failure.

A missing provider key, a provider outage, and a model response that breaks
the report contract all end the review without an approvable verdict. The
check run then reports a failure.

## Fork pull requests

A fork pull request receives no provider secret from the repository. The
review runs only after all of the following hold.

- A maintainer applies the `safe-to-review` label to the pull request.
- The Immutable Compliance run for the same head revision succeeded.
- A maintainer approves the `fork-review` environment.

The fork job reads the `MODEL_API_KEY` environment secret from the
`fork-review` environment. The environment supplies the key only after the
approval.

## Repository settings a maintainer applies

1. Add the `OLLAMA_API_KEY` repository secret.
2. Create the `safe-to-review` label.
3. Create the `fork-review` environment. Restrict the deployment branches
   to the default branch. Add a required reviewer. Add the `MODEL_API_KEY`
   environment secret.
4. Add the `security-review` and `quality-review` checks as required status
   checks on `main`. Restrict both checks to the GitHub Actions app.

Apply the secret first. Without it every review fails before a verdict.

## Trust boundary

- A pull request never runs as code. The review reads pull request content
  as data.
- The reviewer code runs from the default branch. A pull request branch
  cannot change it.
- Every checkout in the review workflows sets `persist-credentials: false`.
- The provider receives the policy and the review envelope. The provider
  receives no repository token.
- Any workflow token with `checks: write` can write a check run name. A
  branch workflow can therefore post a passing check run that hides a
  blocking verdict. The ruleset that requires human review for changes under
  `.github/workflows/` closes that path.
- A same-repository branch can read repository secrets. The `OLLAMA_API_KEY`
  repository secret therefore reaches any contributor who can push a
  branch.

## Cost

Each pull request costs up to two model calls. A report that breaks the
response contract costs one retry.

## Upgrade path

1. Pick a new foucault or euler release commit.
2. Diff the upstream reusable workflow and adapter scripts against the
   vendored copies.
3. Copy the new files into this repository.
4. Update the pin in the caller workflow and the version comment beside it.
5. Update the recorded digests in the review tests under `tests/`.
6. Run the policy test suite and the workflow checkers.
