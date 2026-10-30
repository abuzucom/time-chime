#!/usr/bin/env python3
"""Test workflow permissions and report sanitization security properties."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class WorkflowPermissionsTest(unittest.TestCase):
    """Workflow files must specify explicit permissions."""

    def test_security_headers_defines_contents_read_permissions(self):
        """Verify security-headers.yml limits default token permissions."""
        workflow_path = ROOT / ".github" / "workflows" / "security-headers.yml"
        text = workflow_path.read_text(encoding="utf-8")
        self.assertRegex(text, r"(?m)^permissions:\s*\n\s+contents:\s*read")


class ZapReportEscapingTest(unittest.TestCase):
    """ZAP report updater must sanitize backslashes before table pipes."""

    def test_escape_cell_sanitizes_backslashes_and_pipes(self):
        """Verify escapeCell replaces backslashes before table pipes."""
        script_path = ROOT / "scripts" / "update-zap-report.mjs"
        text = script_path.read_text(encoding="utf-8")
        backslash_pos = text.find('.replace(/\\\\/g, "\\\\\\\\")')
        pipe_pos = text.find('.replace(/\\|/g, "\\\\|")')
        self.assertNotEqual(backslash_pos, -1, "Backslash escaping not found")
        self.assertNotEqual(pipe_pos, -1, "Pipe escaping not found")
        self.assertLess(
            backslash_pos,
            pipe_pos,
            "Backslashes must be escaped before pipes",
        )


class ActionPinTest(unittest.TestCase):
    """Workflow action references must be pinned to full commit SHAs."""

    def test_github_coverage_uses_expected_action_pins(self):
        """Verify github-coverage.yml pins the bumped actions."""
        workflow_path = ROOT / ".github" / "workflows" / "github-coverage.yml"
        text = workflow_path.read_text(encoding="utf-8")
        self.assertIn(
            "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
            text,
        )
        self.assertIn(
            "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
            text,
        )
        self.assertIn(
            "actions/upload-code-coverage@2b21a77928be8d5168c2b9581a67f2adbebacc52",
            text,
        )

    def test_dependency_audit_uses_expected_action_pins(self):
        """Verify dependency-audit.yml pins the bumped actions."""
        workflow_path = ROOT / ".github" / "workflows" / "dependency-audit.yml"
        text = workflow_path.read_text(encoding="utf-8")
        self.assertIn(
            "github/codeql-action/upload-sarif@6f2ac81f5cd81fe351a197ba0b00d91d03cd2aee",
            text,
        )
        self.assertIn(
            "google/osv-scanner-action/osv-scanner-action@b1d267aea5211fa648d9d442fa64b90dbdcbdd36",
            text,
        )


if __name__ == "__main__":
    unittest.main()
