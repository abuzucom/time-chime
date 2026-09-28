#!/usr/bin/env python3
"""Test that all repository workflow action pins use full commit SHAs."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import check_action_pins


class WorkflowActionPinsTest(unittest.TestCase):
    """Repository workflows must pin external actions to full commit SHAs."""

    def test_all_workflow_action_pins(self):
        """Verify that every workflow file in .github/workflows has no unpinned actions."""
        workflow_paths = check_action_pins._workflow_paths(ROOT)
        self.assertTrue(workflow_paths, "No workflow files were found")
        for path in workflow_paths:
            violations = check_action_pins.find_violations(
                path.read_text(encoding="utf-8"), str(path)
            )
            self.assertEqual(violations, [], f"Action pin violations in {path.name}")


if __name__ == "__main__":
    unittest.main()
