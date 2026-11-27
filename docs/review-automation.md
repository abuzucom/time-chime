# Pull request review automation

Five model driven reviews run on pull requests in this repository. Three run
on every pull request. Two run when a maintainer adds the matching scan
label. Every review posts a report on the pull request and publishes a check
run.

## What runs

| Persona | Domain | Caller | Trigger | Check run |
| --- | --- | --- | --- | --- |
| foucault | security | `security-review-pr.yml` | The Immutable Compliance workflow completes | `foucault / security` |
| euler | quality | `quality-review-pr.yml` | The Convention Sync Check workflow and the Immutable Compliance workflow complete for the same head revision | `euler / quality` |
| generay | time | `generay-time-review-pr.yml` | The Convention Sync Check workflow and the Immutable Compliance workflow complete for the same head revision | `generay / time` |
| adorno | user interface | `persona-review-labels.yml` | The `adorno-scan-requested` label is present | `adorno / ui` |
| havel | privacy | `persona-review-labels.yml` | The `havel-scan-requested` label is present | `havel / privacy` |

The Immutable Compliance workflow is the privileged pull request scan in
`immutable-conflict-check.yml`. The Convention Sync Check workflow is the
pull request test run in `sync-check.yml`. The quality and time reviews
start only when both runs succeeded for the same head revision. The review
waits for the test suite.

The three always-on callers use the `workflow_run` trigger. GitHub runs a
workflow run workflow from the default branch alone. A pull request cannot
edit the reviewer. The label caller uses `pull_request_target` for the same
reason. The engine reads the pull request head as Git objects and never
executes it.

## Pinned revision

| Source | Version | Commit |
| --- | --- | --- |
| `abuzucom/agents-personas` | 1.0.0 | `1649e5c9710fd85d6cca12006e344af27a5404a6` |

Every `uses:` pin and every `personas_ref` input in this repository names
that commit. The wrapper loads the engine, the persona policy, and the model
adapter from the pinned commit. The repository supplies no adapter files.

| Path | Role |
| --- | --- |
| `.github/workflows/security-review-pr.yml` | The foucault caller |
| `.github/workflows/quality-review-pr.yml` | The euler caller |
| `.github/workflows/generay-time-review-pr.yml` | The generay caller |
| `.github/workflows/persona-review-labels.yml` | The adorno and havel caller |

## Provider

The engine reads one credential. The caller maps the `OLLAMA_API_KEY`
repository secret to the `MODEL_API_KEY` secret of the reusable workflow. The
engine reads the key from the environment and fails before any request when
the key is empty.

The provider profile comes from the pinned commit. It selects Ollama with
`kimi-k2.7-code` and routes a large review to `minimax-m3.1-flash`.

## Verdicts

Every review ends with a `VERDICT` line. The allowed tokens are `APPROVE`,
`BLOCK`, and `NEEDS-HUMAN`. Every caller sets `fail_on_block`. A blocking
verdict fails the check run and reports the failure. A `NEEDS-HUMAN` verdict
warns and concludes neutral.

A missing provider key, a provider outage, and a model response that breaks
the report contract all end the review without an approvable verdict. The
check run then reports a failure.

The caller reads the live check runs of the head revision before it starts
a review. A head that already carries a verdict from the same caller keeps
that verdict. One head revision costs one model call.

## Fork pull requests

A fork pull request receives no provider secret from the repository. The
engine publishes a skipped check for it and makes no model call. The
`safe-to-review` label and the `fork-review` environment no longer select a
review path. A maintainer can delete both after the change merges.

## Repository settings a maintainer applies

1. Keep the `OLLAMA_API_KEY` repository secret. Every caller maps it to the
   provider key.
2. Create the `adorno-scan-requested` and `havel-scan-requested` labels.
3. Create the `stop-requested` label. Removing it reviews a labeled pull
   request once and then stops every persona.
4. Add the `foucault / security`, `euler / quality`, `generay / time`,
   `adorno / ui`, and `havel / privacy` checks as required status checks on
   `main`. Restrict the checks to the GitHub Actions app.
5. Remove the `security-review` and `quality-review` checks after the
   change merges. The old names belong to the retired review implementation.

Apply the secret first. Without it every review fails before a verdict.

## Trust boundary

- A pull request never runs as code. The review reads pull request content
  as data.
- The reviewer code runs from the default branch. A pull request branch
  cannot change it.
- The provider receives the policy and the review envelope. The provider
  receives no repository token.
- Any workflow token with `checks: write` can write a check run name. A
  branch workflow can therefore post a passing check run that hides a
  blocking verdict. The ruleset that requires human review for changes under
  `.github/workflows/` closes that path.
- A same-repository branch can read repository secrets. The `OLLAMA_API_KEY`
  repository secret therefore reaches any contributor who can push a
  branch.
- The label caller runs `pull_request_target`. The file
  `.compliance-tree-exemptions.json` on the base branch reviews it. The
  manifest pins the caller content, the allowed secret names, the bound
  wrapper commits, and the write scopes that the caller jobs may request.

## Cost

Each pull request costs up to three model calls. A report that breaks the
response contract costs one retry. The label reviews cost one model call
each on a labeled pull request.

## Upgrade path

1. Pick a new `abuzucom/agents-personas` release commit.
2. Replace the commit in every `uses:` pin and every `personas_ref` input in
   the four caller files.
3. Recompute the SHA-256 of `.github/workflows/persona-review-labels.yml` and
   update `.compliance-tree-exemptions.json` on the base branch first.
4. Run the policy test suite and the workflow checkers.
