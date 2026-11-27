"""Verify trusted setup-python action revisions in privileged workflows."""
import unittest
from pathlib import Path

import yaml

from scripts import check_compliance_tree as checker

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "immutable-conflict-check.yml"
CURRENT = "actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0"
TEMPLATE = "actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065"
UNAPPROVED = "actions/setup-python@" + ("1" * 40)


class TrustedPythonPinTest(unittest.TestCase):
    """Accept approved pins without admitting unapproved workflow changes."""

    def assert_pin_result(self, pin: str, accepted: bool) -> None:
        text = WORKFLOW.read_text(encoding="utf-8").replace(CURRENT, pin)
        document = yaml.safe_load(text)
        violations = checker._pull_target_violations(document, text, str(WORKFLOW))
        self.assertEqual(not violations, accepted, violations)

    def test_current_pin_is_accepted(self) -> None:
        self.assert_pin_result(CURRENT, True)

    def test_template_pin_is_accepted(self) -> None:
        self.assert_pin_result(TEMPLATE, True)

    def test_other_pin_is_rejected(self) -> None:
        self.assert_pin_result(UNAPPROVED, False)

    def test_extra_step_is_rejected(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8").replace(CURRENT, TEMPLATE)
        document = yaml.safe_load(text)
        document["jobs"]["immutable-compliance"]["steps"].append({"run": "echo unexpected"})
        violations = checker._pull_target_violations(document, text, str(WORKFLOW))
        self.assertTrue(violations)


if __name__ == "__main__":
    unittest.main()
