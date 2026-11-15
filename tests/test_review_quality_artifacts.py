#!/usr/bin/env python3
"""Cover the vendored abuzucom/euler review artifact."""
import hashlib
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
QUALITY_REUSABLE = ROOT / ".github" / "workflows" / "quality-review.yml"

# SHA-256 digest of the vendored upstream file. An upgrade changes the
# digest in the same commit that changes the pinned revision.
VENDORED_DIGEST = "48129ad1654a9958ba6457cdcbbe33f2bfb911edc3d2760f1cc4e6c562081c8c"


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


def workflow_call_inputs(path):
    """Return the reusable workflow inputs of one workflow file."""
    document = load_workflow(path)
    trigger = document.get("on", document.get(True))
    return trigger["workflow_call"]["inputs"]


class VendoredQualityFileTest(unittest.TestCase):
    """The vendored euler file stays at the adopted revision."""

    def test_vendored_file_matches_recorded_digest(self):
        """Verify that the vendored workflow matches its recorded digest."""
        self.assertEqual(
            content_digest(QUALITY_REUSABLE),
            VENDORED_DIGEST,
            "vendored file changed: .github/workflows/quality-review.yml",
        )


class QualityReusableWorkflowTest(unittest.TestCase):
    """The quality reusable workflow keeps its input contract."""

    def test_required_inputs_stay_required(self):
        """Verify that the revision and the pull request stay required."""
        inputs = workflow_call_inputs(QUALITY_REUSABLE)
        for name in ("pr_number", "base_sha", "head_sha", "quality_ref"):
            with self.subTest(input=name):
                self.assertTrue(inputs[name]["required"])

    def test_exclusion_input_stays_available(self):
        """Verify that the prescan exclusion input stays in the contract."""
        inputs = workflow_call_inputs(QUALITY_REUSABLE)
        self.assertIn("exclude_paths", inputs)

    def test_jobs_separate_the_fork_path(self):
        """Verify that the fork job waits for the protected environment."""
        document = load_workflow(QUALITY_REUSABLE)
        self.assertIn("review", document["jobs"])
        self.assertEqual(
            document["jobs"]["fork-review"]["environment"],
            "fork-review",
        )

    def test_policy_and_adapter_load_from_the_pinned_commit(self):
        """Verify that the workflow reads the euler commit it names."""
        text = QUALITY_REUSABLE.read_text(encoding="utf-8")
        self.assertIn("repository: abuzucom/euler", text)
        self.assertIn("path: .euler", text)
