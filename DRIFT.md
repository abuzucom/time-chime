# Drift

The default `scripts/sync.py` operation normalizes line endings and keeps the
AGENTS.md family content identical across all eight tool copies. Shared
manifest modes cover the gate files below. Adopting repositories maintain other
files under `scripts/`, `hooks/`, and `tests/` separately.

`scripts/sync.py --check-shared` verifies each repository's local shared files
against the local `shared-files.json`. The command inspects one repository.
The command limits comparison to local files and the local manifest. A local
file and manifest mismatch fails the local check. The mismatch leaves checks
in other repositories unchanged.

Cross-repository equality requires coordinated file and manifest updates in
controlled repositories. The local manifest check enforces local equality
alone. Uncontrolled mirrors have no reporting obligation to this repository.

## Three categories

| Category           | Example                                                               | Requirement                                       |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------- |
| Expected to differ | settings files, CODEOWNERS, CI workflows, a repository's own checkers | Record the difference in controlled repositories. |
| Not adopted        | a repository that took the branch gate and declined the identity gate | Record the status in controlled repositories.     |
| True drift         | the same adopted file differs between controlled repositories         | Record drift and review it.                       |

Only true drift supplies new template information. A declined file records
adoption scope. A repository-specific settings file records local hook names.
Controlled adopters record those categories. Uncontrolled mirrors have no
reporting obligation here.

A not-adopted file can produce a difference in an adopted file. Record the
cause beside the effect.

## Who owns which field

| File                     | Repository              | Owns                                           |
| ------------------------ | ----------------------- | ---------------------------------------------- |
| `DRIFT.md`               | `abuzucom/agents`       | Drift policy.                                  |
| `adopters/<repo>.md`     | `abuzucom/agents`       | Adopted-at commit and taken or declined files. |
| `docs/template-drift.md` | the adopting repository | Local differences and reasons.                 |

Keep each field in the owning file. Cross-reference records with stable
locations.

## The shared-file manifest

`SHARED_FILES` in `scripts/sync.py` lists files that must retain the same
line-ending-normalized content. The list includes `hooks/_gate_core.py`, both
shell gates, `hooks/require_consent.py`, `tests/gate_corpus.py`, and both shell
gate suites.

Coordinate each shared-file change across every repository holding the file.
Run `scripts/sync.py --write-shared` in each repository. Commit each local
manifest. Update the required drift records for deliberate differences.
Hashing normalizes line endings before comparison. A Windows checkout therefore
avoids false drift reports for line endings.

Generic exclusions include repository-specific settings, CI, CODEOWNERS,
repository-owned checks, declined files, and coverage baselines for suites that
differ. When local changes exclude an adopted file, record true drift in the
adopter record and the adopting repository's drift record.

## Prose policy bundle

Treat the following files as one adoption bundle:

- `scripts/prose_policy.py`
- `scripts/prose_bans.txt`
- `scripts/check_hedging.py`
- `scripts/check_pull_request_message.py`

`scripts/prose_policy.py` supplies shared prose analysis.
`scripts/prose_bans.txt` supplies scoped exact vocabulary entries.
`scripts/check_hedging.py` applies the policy to supplied files.
`scripts/check_pull_request_message.py` applies the policy to pull request
titles and descriptions. The pull request checker also uses
`scripts/check_commit_message.py` for title checks.

New adoption snapshots must take or decline the four prose policy files as one
unit. Subsequent policy changes require coordinated updates to all adopted
bundle files. Historical adopter records retain explicit decisions from each
adoption snapshot. Later bundle files remain outside an adopted snapshot until
an explicit decision records each status.

## Opening a drift issue

For true drift, open an issue in `abuzucom/agents`. Name the file. Describe the
change and reason. Link the local drift record. State an upstreaming
recommendation. The template maintainer adopts or declines the change. The
template maintainer then closes the issue.

## Adopters

Adoption records for controlled repositories live upstream in
`abuzucom/agents/adopters/`. This repository records local differences in
`docs/template-drift.md`.
