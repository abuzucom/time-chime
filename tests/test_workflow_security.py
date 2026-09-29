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


if __name__ == "__main__":
    unittest.main()
