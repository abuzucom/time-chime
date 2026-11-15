#!/usr/bin/env python3
"""Cover the vendored abuzucom/foucault review artifacts."""
import hashlib
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_ROOT = ROOT / ".github" / "workflows"
SECURITY_REUSABLE = WORKFLOW_ROOT / "security-review.yml"

# SHA-256 digests of the vendored upstream files. An upgrade changes a
# digest in the same commit that changes the pinned revision.
VENDORED_DIGESTS = {
    ".github/workflows/security-review.yml":
        "63e7caaf5fcb38d7d5ba6af136bf03025779a65eea164d64bf6054d30f183c88",
    "ci/build_pr_case.py":
        "3a9ba03c30b254041ae24889ec9d1ce24bdaed48df2b38cd8c679eac003ba727",
    "ci/call_model.py":
        "fb13c66c48eca78195cb54e16787c95671e4c2f87f99b517e0ff34e6e4d7cada",
    "ci/run_model_command.py":
        "494cb0bfd49b6d490c87f009a0b252cb988c2fa74c1a6efe11435e72173899e5",
    "ci/model_providers.json":
        "4b5215ac55bf3ca59b630e912d975f94a435c2d0636eb4bab9e859265bebfd7c",
    "scripts/check_pr_review_response.py":
        "2b22c34d7ffd844556841239c8ea51ddfeca158844a2b08f0faaf3b4ec40972b",
}

# The reusable workflow runs these scripts from the caller checkout.
CALLER_SIDE_SCRIPTS = (
    "ci/build_pr_case.py",
    "ci/call_model.py",
    "ci/model_providers.json",
    "ci/run_model_command.py",
    "scripts/check_pr_review_response.py",
)

# The reusable workflow names these scripts when it verifies the checkout.
WORKFLOW_NAMED_SCRIPTS = (
    "ci/build_pr_case.py",
    "ci/run_model_command.py",
    "scripts/check_pr_review_response.py",
)


def load_workflow(path):
    """Return the parsed workflow document."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def content_digest(path):
    """Return the SHA-256 digest with line endings normalized.

    A checkout on Windows holds CRLF line endings while the blob holds LF.
    The normalization matches scripts/sync.py so the digest stays the same on
    every platform.
    """
    body = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


class VendoredSecurityFilesTest(unittest.TestCase):
    """The vendored foucault files stay at the adopted revision."""

    def test_vendored_files_match_recorded_digests(self):
        """Verify that every vendored file matches its recorded digest."""
        for name, digest in VENDORED_DIGESTS.items():
            with self.subTest(path=name):
                self.assertEqual(
                    content_digest(ROOT / name),
                    digest,
                    f"vendored file changed: {name}",
                )

    def test_caller_side_scripts_exist(self):
        """Verify that the adapter scripts sit in the checkout."""
        for name in CALLER_SIDE_SCRIPTS:
            with self.subTest(path=name):
                self.assertTrue((ROOT / name).is_file(), f"missing {name}")


class SecurityReusableWorkflowTest(unittest.TestCase):
    """The security reusable workflow keeps its input contract."""

    def test_required_inputs_stay_required(self):
        """Verify that the policy revision and the adapter stay required."""
        document = load_workflow(SECURITY_REUSABLE)
        inputs = document[True]["workflow_call"]["inputs"]
        for name in ("audit_ref", "model_call_command"):
            with self.subTest(input=name):
                self.assertTrue(inputs[name]["required"])

    def test_provider_secret_stays_optional(self):
        """Verify that the caller decides whether the key is supplied."""
        document = load_workflow(SECURITY_REUSABLE)
        secrets = document[True]["workflow_call"]["secrets"]
        self.assertIn("MODEL_API_KEY", secrets)
        self.assertFalse(secrets["MODEL_API_KEY"]["required"])

    def test_jobs_separate_the_fork_path(self):
        """Verify that the fork job waits for the protected environment."""
        document = load_workflow(SECURITY_REUSABLE)
        self.assertIn("review", document["jobs"])
        self.assertEqual(
            document["jobs"]["fork-review"]["environment"],
            "fork-review",
        )

    def test_workflow_names_the_caller_side_scripts(self):
        """Verify that the reusable workflow lists the adapter it needs."""
        text = SECURITY_REUSABLE.read_text(encoding="utf-8")
        for name in WORKFLOW_NAMED_SCRIPTS:
            with self.subTest(script=name):
                self.assertIn(name, text)
