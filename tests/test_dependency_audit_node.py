#!/usr/bin/env python3
"""Test the Node runtime that the dependency audit workflow selects."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "dependency-audit.yml"
NODE_VERSION_PATTERN = re.compile(r'(?m)^\s+node-version:\s*"?(\d+)"?\s*$')
# @tanstack/react-start and its start-* packages declare engines node >=22.12.0.
MINIMUM_NODE_MAJOR = 22


class DependencyAuditNodeTest(unittest.TestCase):
    """The audit job must run on a Node major that the dependencies support."""

    def test_audit_uses_supported_node_major(self) -> None:
        """Verify every node-version in dependency-audit.yml meets the minimum."""
        text = WORKFLOW_PATH.read_text(encoding="utf-8")
        node_majors = [int(major) for major in NODE_VERSION_PATTERN.findall(text)]
        self.assertTrue(node_majors, "dependency-audit.yml sets no node-version")
        for node_major in node_majors:
            self.assertGreaterEqual(node_major, MINIMUM_NODE_MAJOR)


if __name__ == "__main__":
    unittest.main()
