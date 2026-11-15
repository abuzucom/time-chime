#!/usr/bin/env python3
"""Cover the pull request review caller wiring."""
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import check_action_pins
import check_persist_credentials

WORKFLOW_ROOT = ROOT / ".github" / "workflows"
SECURITY_CALLER = WORKFLOW_ROOT / "security-review-pr.yml"
SECURITY_REUSABLE = WORKFLOW_ROOT / "security-review.yml"
QUALITY_CALLER = WORKFLOW_ROOT / "quality-review-pr.yml"
QUALITY_REUSABLE = WORKFLOW_ROOT / "quality-review.yml"
REVIEW_WORKFLOWS = (
    SECURITY_CALLER,
    SECURITY_REUSABLE,
    QUALITY_CALLER,
    QUALITY_REUSABLE,
)

FOUCAULT_REF = "6ca2829208e718afdd2402255c501c4a94b45b4f"
EULER_REF = "eb97d1fe7bfbfec97997a30846f78a57a6f2f2e3"


def load_workflow(path):
    """Return the parsed workflow document."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def trigger_workflows(path):
    """Return the workflow_run trigger list of one workflow."""
    document = load_workflow(path)
    trigger = document.get("on", document.get(True))
    return trigger["workflow_run"]["workflows"]


def reusable_jobs(path):
    """Return the jobs that call a reusable workflow."""
    document = load_workflow(path)
    return {
        name: spec
        for name, spec in document["jobs"].items()
        if "uses" in spec
    }


class SecurityCallerTest(unittest.TestCase):
    """The security review caller wires the pinned foucault review."""

    def test_caller_triggers_on_immutable_compliance(self):
        """Verify that the caller starts after the compliance scan."""
        self.assertEqual(
            trigger_workflows(SECURITY_CALLER),
            ["Immutable Compliance"],
        )

    def test_review_jobs_use_the_local_reusable_workflow(self):
        """Verify that both review jobs call the vendored workflow."""
        jobs = reusable_jobs(SECURITY_CALLER)
        self.assertEqual(sorted(jobs), ["fork-review", "review"])
        for name, spec in jobs.items():
            with self.subTest(job=name):
                self.assertEqual(
                    spec["uses"],
                    "./.github/workflows/security-review.yml",
                )

    def test_review_jobs_pin_the_policy_revision(self):
        """Verify that both review jobs load the pinned AUDIT.md."""
        for name, spec in reusable_jobs(SECURITY_CALLER).items():
            with self.subTest(job=name):
                self.assertEqual(spec["with"]["audit_ref"], FOUCAULT_REF)
                self.assertEqual(
                    spec["with"]["model_call_command"],
                    "python3 ci/call_model.py",
                )

    def test_review_job_maps_the_provider_secret(self):
        """Verify that the same-repository job receives the provider key."""
        spec = load_workflow(SECURITY_CALLER)["jobs"]["review"]
        self.assertEqual(
            spec["secrets"]["MODEL_API_KEY"],
            "${{ secrets.OLLAMA_API_KEY }}",
        )
        self.assertTrue(spec["with"]["fail_on_block"])

    def test_fork_job_relies_on_the_environment_secret(self):
        """Verify that the fork job passes no repository secret."""
        spec = load_workflow(SECURITY_CALLER)["jobs"]["fork-review"]
        self.assertNotIn("secrets", spec)
        self.assertTrue(spec["with"]["fork_review"])


class QualityCallerTest(unittest.TestCase):
    """The quality review caller wires the pinned euler review."""

    def test_caller_triggers_on_both_gates(self):
        """Verify that the caller waits for the test run and the scan."""
        self.assertEqual(
            trigger_workflows(QUALITY_CALLER),
            ["Convention Sync Check", "Immutable Compliance"],
        )

    def test_resolver_reads_both_gate_workflows(self):
        """Verify that the resolver checks both gate runs for one head."""
        text = QUALITY_CALLER.read_text(encoding="utf-8")
        self.assertIn("latestRun('Convention Sync Check', 'pull_request')", text)
        self.assertIn("'Immutable Compliance', 'pull_request_target'", text)

    def test_review_jobs_use_the_local_reusable_workflow(self):
        """Verify that both review jobs call the vendored workflow."""
        jobs = reusable_jobs(QUALITY_CALLER)
        self.assertEqual(sorted(jobs), ["fork-review", "review"])
        for name, spec in jobs.items():
            with self.subTest(job=name):
                self.assertEqual(
                    spec["uses"],
                    "./.github/workflows/quality-review.yml",
                )

    def test_review_jobs_pin_the_policy_revision(self):
        """Verify that both review jobs load the pinned QUALITY.md."""
        for name, spec in reusable_jobs(QUALITY_CALLER).items():
            with self.subTest(job=name):
                self.assertEqual(spec["with"]["quality_ref"], EULER_REF)
                self.assertTrue(spec["with"]["fail_on_block"])

    def test_review_jobs_exclude_the_test_and_scratch_paths(self):
        """Verify that the deterministic prescan skips local test paths."""
        for name, spec in reusable_jobs(QUALITY_CALLER).items():
            with self.subTest(job=name):
                self.assertEqual(
                    spec["with"]["exclude_paths"],
                    "tests/** .test-temp/**",
                )

    def test_review_job_maps_the_provider_secret(self):
        """Verify that the same-repository job receives the provider key."""
        spec = load_workflow(QUALITY_CALLER)["jobs"]["review"]
        self.assertEqual(
            spec["secrets"]["MODEL_API_KEY"],
            "${{ secrets.OLLAMA_API_KEY }}",
        )

    def test_fork_job_relies_on_the_environment_secret(self):
        """Verify that the fork job passes no repository secret."""
        spec = load_workflow(QUALITY_CALLER)["jobs"]["fork-review"]
        self.assertNotIn("secrets", spec)
        self.assertTrue(spec["with"]["fork_review"])


class ReviewWorkflowPolicyTest(unittest.TestCase):
    """The review workflows satisfy the repository workflow rules."""

    def test_review_workflows_pin_every_external_action(self):
        """Verify that no review workflow holds an unpinned action."""
        for path in REVIEW_WORKFLOWS:
            with self.subTest(path=path.name):
                violations = check_action_pins.find_violations(
                    path.read_text(encoding="utf-8"), str(path)
                )
                self.assertEqual(violations, [])

    def test_review_workflows_disable_persisted_credentials(self):
        """Verify that every checkout drops the persisted credential."""
        for path in REVIEW_WORKFLOWS:
            with self.subTest(path=path.name):
                violations = check_persist_credentials.find_violations(
                    path.read_text(encoding="utf-8"), str(path)
                )
                self.assertEqual(violations, [])

    def test_resolver_requires_an_open_pull_request(self):
        """Verify that a merged head starts no review."""
        text = SECURITY_CALLER.read_text(encoding="utf-8")
        self.assertIn('candidate.state === "open"', text)
        self.assertIn('pullRequest.state !== "open"', text)
