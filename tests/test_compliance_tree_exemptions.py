#!/usr/bin/env python3
"""Test the base-branch exemption manifest in check_compliance_tree.py.

Each class stays small because the hook coverage runner gives every test
class one shard with a fixed time limit.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import check_compliance_tree

REPO_ROOT = Path(__file__).resolve().parent.parent
CALLER_PATH = ".github/workflows/persona-review-labels.yml"
PERSONAS_COMMIT = "1649e5c9710fd85d6cca12006e344af27a5404a6"
ADORNO_TARGET = (
    "abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml@"
    + PERSONAS_COMMIT)
HAVEL_TARGET = (
    "abuzucom/agents-personas/.github/workflows/havel-privacy-review.yml@"
    + PERSONAS_COMMIT)
# A well-formed sha256 that the structural workflow checks never compare.
PLACEHOLDER_DIGEST = "0" * 64
CALLER = """\
name: persona-review-labels
on:
  pull_request_target:
    types: [labeled, synchronize, unlabeled]
concurrency:
  group: persona-review-labels-${{ github.event.pull_request.number }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  adorno:
    if: >-
      contains(github.event.pull_request.labels.*.name, 'adorno-scan-requested')
    permissions:
      checks: write
      contents: read
      pull-requests: write
    uses: abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml@\
1649e5c9710fd85d6cca12006e344af27a5404a6
    with:
      personas_ref: "1649e5c9710fd85d6cca12006e344af27a5404a6"
    secrets:
      MODEL_API_KEY: ${{ secrets.OLLAMA_API_KEY }}
"""
CHECKOUT_CALLER = """\
name: persona-review-labels
on:
  pull_request_target:
    types: [labeled]
permissions:
  contents: read
jobs:
  adorno:
    permissions:
      checks: write
    uses: abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml@\
1649e5c9710fd85d6cca12006e344af27a5404a6
    secrets:
      MODEL_API_KEY: ${{ secrets.OLLAMA_API_KEY }}
"""


def build_exemptions(document: dict) -> object:
    """Parse one manifest document through a temporary trusted root."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        manifest = root / check_compliance_tree.EXEMPTIONS_FILE
        manifest.write_text(json.dumps(document), encoding="ascii")
        return check_compliance_tree.load_exemptions(root)


def reviewed_manifest(secrets: list[str], targets: list[str]) -> dict:
    """Return a manifest that reviews the caller workflow."""
    return {
        "version": 1,
        "pull_request_target": {
            CALLER_PATH: {
                "secrets": secrets,
                "sha256": PLACEHOLDER_DIGEST,
                "reusable_workflows": dict.fromkeys(targets),
                "permissions": {"checks": "write", "pull-requests": "write"},
            },
        },
    }


class WorkflowScan:
    """Run the workflow checks with the trusted persist-credentials module."""

    persist = check_compliance_tree._load_module(
        REPO_ROOT / "scripts" / "check_persist_credentials.py",
        "check_persist_credentials")

    def scan(self, text: str, path: str, exemptions=None) -> list[str]:
        """Return workflow violations for one workflow text."""
        return check_compliance_tree._workflow_violations(
            text, path, self.persist, exemptions)


class UnlistedWorkflowTest(WorkflowScan, unittest.TestCase):
    """Workflows absent from the manifest keep the closed schema."""

    def test_unlisted_caller_still_fails(self) -> None:
        findings = self.scan(CALLER, CALLER_PATH)
        self.assertIn(f"{CALLER_PATH}: pull_request_target references secrets", findings)
        self.assertIn(f"{CALLER_PATH}: pull_request_target job schema is not trusted", findings)

    def test_other_path_not_exempted(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        findings = self.scan(CALLER, ".github/workflows/other-review-pr.yml", exemptions)
        self.assertTrue(any("references secrets" in item for item in findings))


class ReviewedWorkflowTest(WorkflowScan, unittest.TestCase):
    """A reviewed caller passes the manifest rule set."""

    def test_reviewed_caller_passes(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        self.assertEqual(self.scan(CALLER, CALLER_PATH, exemptions), [])

    def test_unlisted_secret_fails(self) -> None:
        exemptions = build_exemptions(reviewed_manifest([], [ADORNO_TARGET]))
        findings = self.scan(CALLER, CALLER_PATH, exemptions)
        self.assertTrue(any("references unlisted secret OLLAMA_API_KEY" in item for item in findings))

    def test_unbound_reusable_workflow_fails(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [HAVEL_TARGET]))
        findings = self.scan(CALLER, CALLER_PATH, exemptions)
        self.assertTrue(any("calls unbound reusable workflow" in item for item in findings))

    def test_unlisted_write_scope_fails(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        document["pull_request_target"][CALLER_PATH]["permissions"] = {"checks": "write"}
        exemptions = build_exemptions(document)
        findings = self.scan(CALLER, CALLER_PATH, exemptions)
        self.assertTrue(any("grants an unlisted write scope pull-requests" in item for item in findings))

    def test_event_data_outside_safe_keys_fails(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        text = CALLER.replace(
            "      personas_ref:", "      title: ${{ github.event.pull_request.title }}\n      personas_ref:")
        findings = self.scan(text, CALLER_PATH, exemptions)
        self.assertTrue(any("interpolates event data in job inputs" in item for item in findings))

    def test_checkout_step_fails(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        text = CALLER.replace(
            "    uses: abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml@",
            "    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n    uses: abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml@")
        findings = self.scan(text, CALLER_PATH, exemptions)
        self.assertTrue(any("checks out code" in item for item in findings))


class ManifestTest(unittest.TestCase):
    """The manifest loader fails closed on every malformed document."""

    def test_absent_manifest_yields_no_exemptions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            exemptions = check_compliance_tree.load_exemptions(Path(directory))
        self.assertEqual(exemptions.pull_target, {})

    def test_malformed_json_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / check_compliance_tree.EXEMPTIONS_FILE).write_text(
                "{", encoding="ascii")
            with self.assertRaises(RuntimeError):
                check_compliance_tree.load_exemptions(root)

    def test_wrong_version_fails_closed(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        document["version"] = 2
        with self.assertRaises(RuntimeError):
            build_exemptions(document)

    def test_unknown_key_fails_closed(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        document["rule7_excluded_trees"] = ["reviewers/*/eval/cases/"]
        with self.assertRaises(RuntimeError):
            build_exemptions(document)

    def test_non_workflow_path_fails_closed(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        document["pull_request_target"][".github/scripts/review.py"] = \
            document["pull_request_target"].pop(CALLER_PATH)
        with self.assertRaises(RuntimeError):
            build_exemptions(document)

    def test_unpinned_remote_target_fails_closed(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        entry = document["pull_request_target"][CALLER_PATH]
        entry["reusable_workflows"] = {ADORNO_TARGET: "not-a-digest"}
        with self.assertRaises(RuntimeError):
            build_exemptions(document)


class PinnedDigestTest(unittest.TestCase):
    """The manifest digest pins the reviewed caller content."""

    def test_matching_digest_passes(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        digests = {CALLER_PATH: PLACEHOLDER_DIGEST}
        self.assertEqual(check_compliance_tree._pinned_digest_violations(exemptions, digests), [])

    def test_changed_digest_fails(self) -> None:
        exemptions = build_exemptions(reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET]))
        digests = {CALLER_PATH: "1" * 64}
        findings = check_compliance_tree._pinned_digest_violations(exemptions, digests)
        self.assertTrue(any("does not match the manifest sha256" in item for item in findings))

    def test_absent_local_target_fails(self) -> None:
        document = reviewed_manifest(["OLLAMA_API_KEY"], [ADORNO_TARGET])
        entry = document["pull_request_target"][CALLER_PATH]
        entry["reusable_workflows"] = {"./.github/workflows/review.yml": PLACEHOLDER_DIGEST}
        exemptions = build_exemptions(document)
        findings = check_compliance_tree._pinned_digest_violations(
            exemptions, {CALLER_PATH: PLACEHOLDER_DIGEST})
        self.assertTrue(any("is absent from the tree" in item for item in findings))


class RepositoryManifestTest(unittest.TestCase):
    """The repository manifest names the reviewed caller and its pins."""

    def test_manifest_reviews_the_label_caller(self) -> None:
        exemptions = check_compliance_tree.load_exemptions(REPO_ROOT)
        reviewed = exemptions.pull_target.get(CALLER_PATH)
        self.assertIsNotNone(reviewed)
        self.assertEqual(reviewed.secrets, frozenset({"OLLAMA_API_KEY"}))
        self.assertEqual(
            reviewed.reusable_workflows, frozenset({ADORNO_TARGET, HAVEL_TARGET}))
        self.assertEqual(
            reviewed.write_scopes, frozenset({"checks", "pull-requests"}))

    def test_manifest_digest_matches_the_caller_file(self) -> None:
        exemptions = check_compliance_tree.load_exemptions(REPO_ROOT)
        reviewed = exemptions.pull_target[CALLER_PATH]
        caller = REPO_ROOT / CALLER_PATH
        if not caller.is_file():
            self.skipTest("the reviewed caller lands in a later change")
        import hashlib
        # A working tree checkout may hold CRLF. The trusted scan reads the
        # Git blob, so the digest covers the normalized bytes.
        content = caller.read_bytes().replace(b"\r\n", b"\n")
        digest = hashlib.sha256(content).hexdigest()
        self.assertEqual(digest, reviewed.caller_digest)


class TrustedBaseScanTest(unittest.TestCase):
    """Run the trusted checker against a candidate tree with a manifest."""

    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.trusted = self.root / "trusted-base"
        (self.trusted / "scripts").mkdir(parents=True)
        for source in sorted((REPO_ROOT / "scripts").glob("*.py")):
            target = self.trusted / "scripts" / source.name
            target.write_bytes(source.read_bytes())
        self.candidate = self.root / "candidate"
        self.candidate.mkdir()

    def write_manifest(self, caller_text: str) -> None:
        """Write one manifest that reviews the caller at its current digest."""
        import hashlib
        manifest = {
            "version": 1,
            "pull_request_target": {
                CALLER_PATH: {
                    "secrets": ["OLLAMA_API_KEY"],
                    "sha256": hashlib.sha256(caller_text.encode("utf-8")).hexdigest(),
                    "reusable_workflows": dict.fromkeys([ADORNO_TARGET]),
                    "permissions": {"checks": "write", "pull-requests": "write"},
                },
            },
        }
        (self.trusted / check_compliance_tree.EXEMPTIONS_FILE).write_text(
            json.dumps(manifest), encoding="ascii")

    def commit_caller(self, caller_text: str) -> str:
        """Commit one candidate tree that holds the reviewed caller."""
        caller = self.candidate / CALLER_PATH
        caller.parent.mkdir(parents=True, exist_ok=True)
        caller.write_bytes(caller_text.encode("utf-8"))
        environment = dict(os.environ)
        environment.update({
            "GIT_AUTHOR_NAME": "exemption test",
            "GIT_AUTHOR_EMAIL": "1234567+exemption-test@users.noreply.github.com",
            "GIT_COMMITTER_NAME": "exemption test",
            "GIT_COMMITTER_EMAIL": "1234567+exemption-test@users.noreply.github.com",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_SYSTEM": os.devnull,
        })
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.candidate,
                       check=True, env=environment, capture_output=True)
        subprocess.run(["git", "add", "--all"], cwd=self.candidate,
                       check=True, env=environment, capture_output=True)
        subprocess.run(["git", "commit", "-qm", "add caller"], cwd=self.candidate,
                       check=True, env=environment, capture_output=True)
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.candidate,
                                check=True, env=environment, capture_output=True,
                                text=True)
        return result.stdout.strip()

    def scan(self, tree: str) -> subprocess.CompletedProcess:
        """Run the trusted checker against the candidate tree."""
        return subprocess.run(
            [sys.executable, str(self.trusted / "scripts" / "check_compliance_tree.py"),
             "--repo", str(self.candidate), "--tree", tree],
            cwd=self.trusted, capture_output=True, text=True, check=False)

    def test_reviewed_caller_passes_the_trusted_scan(self) -> None:
        self.write_manifest(CALLER)
        tree = self.commit_caller(CALLER)
        result = self.scan(tree)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_changed_caller_fails_the_digest_pin(self) -> None:
        self.write_manifest(CALLER)
        changed = CALLER.replace("      personas_ref:", "      title: ${{ github.event.pull_request.title }}\n      personas_ref:")
        tree = self.commit_caller(changed)
        result = self.scan(tree)
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not match the manifest sha256", result.stdout + result.stderr)

    def test_unlisted_caller_fails_the_trusted_scan(self) -> None:
        tree = self.commit_caller(CALLER)
        result = self.scan(tree)
        self.assertEqual(result.returncode, 1)
        self.assertIn("pull_request_target", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
