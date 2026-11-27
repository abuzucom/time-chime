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
QUALITY_CALLER = WORKFLOW_ROOT / "quality-review-pr.yml"
GENERAY_CALLER = WORKFLOW_ROOT / "generay-time-review-pr.yml"
LABEL_CALLER = WORKFLOW_ROOT / "persona-review-labels.yml"
REVIEW_WORKFLOWS = (
    SECURITY_CALLER,
    QUALITY_CALLER,
    GENERAY_CALLER,
    LABEL_CALLER,
)

PERSONAS_COMMIT = "1649e5c9710fd85d6cca12006e344af27a5404a6"
PERSONAS_TARGETS = {
    "foucault": "abuzucom/agents-personas/.github/workflows/foucault-security-review.yml",
    "euler": "abuzucom/agents-personas/.github/workflows/euler-quality-review.yml",
    "generay": "abuzucom/agents-personas/.github/workflows/generay-time-review.yml",
    "adorno": "abuzucom/agents-personas/.github/workflows/adorno-ui-review.yml",
    "havel": "abuzucom/agents-personas/.github/workflows/havel-privacy-review.yml",
}
CHECK_NAMES = {
    "foucault": "foucault / security",
    "euler": "euler / quality",
    "generay": "generay / time",
    "adorno": "adorno / ui",
    "havel": "havel / privacy",
}


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


class PersonaPinTest(unittest.TestCase):
    """Every caller pins one agents-personas commit."""

    def test_callers_pin_the_personas_workflows(self):
        """Verify that each caller names the pinned wrapper commit."""
        expected = {
            SECURITY_CALLER: ["foucault"],
            QUALITY_CALLER: ["euler"],
            GENERAY_CALLER: ["generay"],
            LABEL_CALLER: ["adorno", "havel"],
        }
        for path, personas in expected.items():
            with self.subTest(path=path.name):
                jobs = reusable_jobs(path)
                self.assertEqual(len(jobs), len(personas))
                for name, spec in jobs.items():
                    persona = name if name in personas else personas[0]
                    self.assertEqual(
                        spec["uses"],
                        f"{PERSONAS_TARGETS[persona]}@{PERSONAS_COMMIT}",
                    )
                    self.assertEqual(spec["with"]["personas_ref"], PERSONAS_COMMIT)

    def test_no_caller_holds_vendored_files(self):
        """Verify that the repository holds no review adapter files."""
        self.assertFalse((ROOT / "ci").exists())
        self.assertFalse((ROOT / "scripts" / "check_pr_review_response.py").exists())
        self.assertFalse((WORKFLOW_ROOT / "security-review.yml").exists())
        self.assertFalse((WORKFLOW_ROOT / "quality-review.yml").exists())


class SecurityCallerTest(unittest.TestCase):
    """The security review caller wires the foucault review."""

    def test_caller_triggers_on_immutable_compliance(self):
        """Verify that the caller starts after the compliance scan."""
        self.assertEqual(
            trigger_workflows(SECURITY_CALLER),
            ["Immutable Compliance"],
        )

    def test_review_job_maps_the_key(self):
        """Verify that the review job receives the provider key."""
        spec = reusable_jobs(SECURITY_CALLER)["review"]
        self.assertEqual(
            spec["secrets"]["MODEL_API_KEY"],
            "${{ secrets.OLLAMA_API_KEY }}",
        )

    def test_review_job_fails_on_block(self):
        """Verify that a blocking verdict fails the check run."""
        spec = reusable_jobs(SECURITY_CALLER)["review"]
        self.assertTrue(spec["with"]["fail_on_block"])

    def test_review_job_withholds_fork_reviews(self):
        """Verify that a fork pull request receives no provider key."""
        spec = reusable_jobs(SECURITY_CALLER)["review"]
        self.assertFalse(spec["with"]["fork_review"])

    def test_resolver_requires_open_pull(self):
        """Verify that a merged head starts no review."""
        text = SECURITY_CALLER.read_text(encoding="utf-8")
        self.assertIn('pullRequest.state === "open"', text)


class QualityCallerTest(unittest.TestCase):
    """The quality review caller wires the euler review."""

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

    def test_review_job_excludes_tests(self):
        """Verify that the review skips the local test paths."""
        spec = reusable_jobs(QUALITY_CALLER)["review"]
        self.assertEqual(spec["with"]["exclude_paths"], "tests/**")

    def test_review_job_maps_the_key(self):
        """Verify that the review job receives the provider key."""
        spec = reusable_jobs(QUALITY_CALLER)["review"]
        self.assertEqual(
            spec["secrets"]["MODEL_API_KEY"],
            "${{ secrets.OLLAMA_API_KEY }}",
        )
        self.assertTrue(spec["with"]["fail_on_block"])


class GenerayCallerTest(unittest.TestCase):
    """The time review caller wires the generay review."""

    def test_caller_triggers_on_both_gates(self):
        """Verify that the caller waits for the test run and the scan."""
        self.assertEqual(
            trigger_workflows(GENERAY_CALLER),
            ["Convention Sync Check", "Immutable Compliance"],
        )

    def test_review_job_reviews_all_files(self):
        """Verify that the review covers every changed file."""
        spec = reusable_jobs(GENERAY_CALLER)["review"]
        self.assertNotIn("paths", spec["with"])
        self.assertNotIn("exclude_paths", spec["with"])

    def test_review_job_maps_the_key(self):
        """Verify that the review job receives the provider key."""
        spec = reusable_jobs(GENERAY_CALLER)["review"]
        self.assertEqual(
            spec["secrets"]["MODEL_API_KEY"],
            "${{ secrets.OLLAMA_API_KEY }}",
        )
        self.assertTrue(spec["with"]["fail_on_block"])
        self.assertFalse(spec["with"]["fork_review"])


class LabelCallerTest(unittest.TestCase):
    """The label caller wires the adorno and havel reviews."""

    def test_caller_runs_on_label_events(self):
        """Verify that the caller reacts to the scan labels."""
        document = load_workflow(LABEL_CALLER)
        trigger = document.get("on", document.get(True))
        self.assertEqual(
            sorted(trigger["pull_request_target"]["types"]),
            ["labeled", "synchronize", "unlabeled"],
        )

    def test_each_persona_waits_for_label(self):
        """Verify that each job names its own scan label."""
        document = load_workflow(LABEL_CALLER)
        for persona, job in (("adorno", "adorno"), ("havel", "havel")):
            with self.subTest(persona=persona):
                condition = document["jobs"][job]["if"]
                self.assertIn(f"{persona}-scan-requested", condition)
                self.assertIn("stop-requested", condition)

    def test_havel_reviews_the_baseline_classes(self):
        """Verify that the privacy review declares no regime scope."""
        spec = reusable_jobs(LABEL_CALLER)["havel"]
        self.assertEqual(spec["with"]["regimes"], "")

    def test_review_jobs_map_the_key(self):
        """Verify that each review job receives the provider key."""
        for name, spec in reusable_jobs(LABEL_CALLER).items():
            with self.subTest(job=name):
                self.assertEqual(
                    spec["secrets"]["MODEL_API_KEY"],
                    "${{ secrets.OLLAMA_API_KEY }}",
                )


class ReviewWorkflowPolicyTest(unittest.TestCase):
    """The review workflows satisfy the repository workflow rules."""

    def test_review_workflows_pin_actions(self):
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

    def test_no_caller_checks_out_head(self):
        """Verify that no caller runs pull request code."""
        for path in REVIEW_WORKFLOWS:
            with self.subTest(path=path.name):
                self.assertNotIn("actions/checkout", path.read_text(encoding="utf-8"))
