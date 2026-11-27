#!/usr/bin/env python3
"""Print the merge order and expected base branch verdicts for a template upgrade.

Several checks run from the base branch, not from the pull request. A
candidate that passes every local suite can still fail those checks after the
first push. This report runs before the push. It lists each base branch
consumer, flags CodeQL paths that the candidate deletes, and runs the prose
checkers on planned commit messages and pull request bodies.

Usage:
    python scripts/plan_template_upgrade.py --base <revision>
        [--codeql-config <path>] [--message <path> ...]

The planner runs no base branch checker. It predicts one verdict from the
diff alone. `check_gate_pr_integrity.py` requires the `gate-change-approved`
label when the candidate changes a protected gate path. Every other consumer
present on the base stays unresolved. Run those checkers by hand from a base
checkout, as `skills/gate-adoption/SKILL.md` describes.

Exit 0 means no expected failure and no unresolved consumer. Exit 1 means the
report lists one or more expected failures. Exit 2 means a usage or Git
error. Exit 3 means no expected failure but one or more unresolved consumers.
"""
import argparse
import subprocess
import sys
from pathlib import Path

import yaml

try:
    from scripts import check_gate_pr_integrity, trusted_git
except ModuleNotFoundError:
    import check_gate_pr_integrity
    import trusted_git

SCRIPTS_DIRECTORY = Path(__file__).resolve().parent
EXPECTED_FAILURE = 1
USAGE_FAILURE = 2
UNRESOLVED_CONSUMERS = 3
# The approval label is the one base verdict that the diff alone predicts.
LABEL_CHECKER = "scripts/check_gate_pr_integrity.py"
MAX_LISTED_PATHS = 3
CODEQL_CONFIG = ".github/codeql/config.yml"
CODEQL_PATHS_KEY = "paths"
PROSE_CHECKERS = ("check_hedging.py", "check_us_spelling.py", "check_english_only.py")
PROSE_TIMEOUT_SECONDS = 60
# Each consumer runs from the base branch. Its owner action decides how a
# failing verdict clears.
BASE_CONSUMERS = (
    (".github/workflows/immutable-conflict-check.yml", "scripts/check_compliance_tree.py",
     "an owner merge past immutable-compliance after review"),
    (".github/workflows/gate-integrity.yml", "scripts/check_gate_pr_integrity.py",
     "the gate-change-approved label from a person after the latest push"),
    (".github/workflows/gate-integrity.yml", "scripts/check_pr_base.py",
     "a pull request base on a stable branch"),
    (".github/workflows/agents-compliance.yml", "scripts/check_agent_prose_gate.py",
     "prose fixes in every gate target file, merged first"),
    (".github/workflows/quality-review-pr.yml", "workflow_run review caller",
     "review caller changes, merged before the template upgrade"),
    (".github/workflows/security-review-pr.yml", "workflow_run review caller",
     "review caller changes, merged before the template upgrade"),
)
MERGE_ORDER = (
    "Prose fixes for the gate target files, against the base branch.",
    "Review caller changes, against the base branch.",
    "The template upgrade, on top.",
)


def git_output(root: Path, arguments: list) -> str | None:
    """Return Git standard output, or None when Git fails."""
    result = trusted_git.run_git(root, arguments)
    return result.stdout if result.returncode == 0 else None


def base_has_path(root: Path, base: str, path: str) -> bool:
    """Return whether the base revision holds a path."""
    return git_output(root, ["cat-file", "-e", f"{base}:{path}"]) is not None


def removed_paths(root: Path, base: str) -> list:
    """Return the paths that the candidate deletes or renames away from the base."""
    output = git_output(root, ["diff", "--name-status", "--find-renames", base, "--"])
    removed = []
    for line in (output or "").splitlines():
        fields = line.split("\t")
        if fields[0].startswith(("D", "R")) and len(fields) > 1:
            removed.append(fields[1])
    return removed


def codeql_paths(root: Path, base: str, config: str = CODEQL_CONFIG) -> tuple:
    """Return (analyzed path entries, problem) for the base CodeQL configuration.

    Only `paths` entries count. Removing a `paths-ignore` entry removes no
    analysis coverage. An absent default file means CodeQL runs without a
    configuration. A named file that is absent or unusable fails closed.
    """
    text = git_output(root, ["show", f"{base}:{config}"])
    if text is None:
        problem = "" if config == CODEQL_CONFIG else f"CodeQL config {config} is absent on the base"
        return [], problem
    try:
        document = yaml.safe_load(text)
    except yaml.YAMLError:
        return [], f"CodeQL config {config} is not valid YAML"
    named = config != CODEQL_CONFIG
    if document is None and not named:
        return [], ""
    values = document.get(CODEQL_PATHS_KEY, []) if isinstance(document, dict) else None
    if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
        return [], f"CodeQL config {config} holds no mapping with a list of path strings"
    return [value.rstrip("/") for value in values], ""


def candidate_tracks(root: Path, entry: str) -> bool:
    """Return whether the candidate index tracks any file at or below a path.

    An empty or untracked directory left in the working tree does not count,
    because CodeQL reads the tracked tree.
    """
    return bool((git_output(root, ["ls-files", "--", entry]) or "").strip())


def codeql_failures(root: Path, base: str, config: str = CODEQL_CONFIG) -> list:
    """Return one expected failure per removed CodeQL path or config problem."""
    entries, problem = codeql_paths(root, base, config)
    if problem:
        return [problem]
    removed = removed_paths(root, base)
    failures = []
    for entry in entries:
        touched = any(path == entry or path.startswith(entry + "/") for path in removed)
        if touched and not candidate_tracks(root, entry):
            failures.append(f"CodeQL path {entry} is in the base config and the candidate removes it")
    return failures


def prose_findings(message: Path) -> list:
    """Return one line per prose checker that reports a finding in a message file."""
    findings = []
    for checker in PROSE_CHECKERS:
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPTS_DIRECTORY / checker), str(message)],
                capture_output=True, text=True, timeout=PROSE_TIMEOUT_SECONDS, check=False)
        except (subprocess.TimeoutExpired, OSError) as error:
            # A checker that cannot finish counts as an expected failure, so
            # the report still lists every consumer and the merge order.
            findings.append(f"{checker} did not finish on {message.name} "
                            f"({type(error).__name__}). Run it by hand before the push")
            continue
        output = (result.stdout + result.stderr).strip()
        if output or result.returncode != 0:
            findings.append(f"{checker} reports findings in {message.name}")
    return findings


def changed_paths(root: Path, base: str) -> list:
    """Return every tracked path that differs from the base plus every untracked path."""
    tracked = git_output(root, ["diff", "--name-only", "--no-renames", base, "--"]) or ""
    untracked = git_output(root, ["ls-files", "--others", "--exclude-standard"]) or ""
    return sorted(set(tracked.splitlines()) | set(untracked.splitlines()))


def label_failure(root: Path, base: str) -> str:
    """Return the predicted approval label failure, or an empty string when none applies."""
    protected = [path for path in changed_paths(root, base)
                 if check_gate_pr_integrity.requires_approval([path])]
    if not protected:
        return ""
    listed = ", ".join(protected[:MAX_LISTED_PATHS])
    more = len(protected) - MAX_LISTED_PATHS
    suffix = f" and {more} more" if more > 0 else ""
    return (f"{LABEL_CHECKER} requires the {check_gate_pr_integrity.APPROVAL_LABEL} label "
            f"for protected paths {listed}{suffix}")


def consumer_verdicts(root: Path, base: str) -> tuple:
    """Return (consumer lines, predicted failures, unresolved consumers) for the base."""
    lines, failures, unresolved = ["Base branch consumers:"], [], []
    for workflow, checker, action in BASE_CONSUMERS:
        present = base_has_path(root, base, workflow)
        state = "present" if present else "absent"
        lines.append(f"- {workflow} ({checker}): {state} on base. Owner action: {action}.")
        if not present:
            continue
        if checker != LABEL_CHECKER:
            unresolved.append(f"{workflow} ({checker}). Run it from a base checkout")
            continue
        failure = label_failure(root, base)
        if failure:
            failures.append(failure)
    return lines, failures, unresolved


def build_report(root: Path, base: str, messages: list,
                 config: str = CODEQL_CONFIG) -> tuple:
    """Return (report lines, expected failure count) for one candidate.

    `build_full_report` also returns the unresolved consumer count.
    """
    lines, failure_count, _unresolved_count = build_full_report(root, base, messages, config)
    return lines, failure_count


def build_full_report(root: Path, base: str, messages: list,
                      config: str = CODEQL_CONFIG) -> tuple:
    """Return (report lines, expected failure count, unresolved count) for one candidate."""
    lines, failures, unresolved = consumer_verdicts(root, base)
    failures.extend(codeql_failures(root, base, config))
    for message in messages:
        failures.extend(prose_findings(message))
    lines.append("Expected failures:")
    lines.extend(f"- {failure}" for failure in failures or ["none"])
    lines.append("Unresolved consumers:")
    lines.extend(f"- {consumer}" for consumer in unresolved or ["none"])
    lines.append("Merge order:")
    lines.extend(f"{index}. {step}" for index, step in enumerate(MERGE_ORDER, start=1))
    return lines, len(failures), len(unresolved)


def main(argv: list | None = None, root: Path | None = None) -> int:
    """Print the upgrade plan for the candidate tree against a base revision."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", required=True, help="base branch revision")
    parser.add_argument("--message", action="append", default=[], type=Path,
                        help="planned commit message or pull request body file")
    # The github-codeql-config-file repository property names the path. Reading
    # the property needs a GitHub API call, so the operator passes its value.
    parser.add_argument("--codeql-config", default=CODEQL_CONFIG,
                        help="base CodeQL configuration path")
    options = parser.parse_args(argv)
    repository = (root or Path.cwd()).resolve()
    # Git would read a leading dash as an option, not as a revision.
    if options.base.startswith("-") or git_output(repository, ["rev-parse", "--verify", f"{options.base}^{{commit}}"]) is None:
        print(f"error: {options.base} is not a commit. Fetch the base branch and retry.",
              file=sys.stderr)
        return USAGE_FAILURE
    missing = [message for message in options.message if not message.is_file()]
    if missing:
        print(f"error: {missing[0]} is not a file. Pass an existing message file.",
              file=sys.stderr)
        return USAGE_FAILURE
    lines, failure_count, unresolved_count = build_full_report(
        repository, options.base, options.message, options.codeql_config)
    print("\n".join(lines))
    if failure_count:
        return EXPECTED_FAILURE
    return UNRESOLVED_CONSUMERS if unresolved_count else 0


if __name__ == "__main__":
    sys.exit(main())
