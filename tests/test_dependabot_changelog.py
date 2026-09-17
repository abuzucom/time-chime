"""Test the trusted Dependabot changelog companion boundaries."""
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "create_dependabot_changelog_pr.py"
WORKFLOW = ROOT / ".github" / "workflows" / "dependabot-changelog.yml"
SYNC_WORKFLOW = ROOT / ".github" / "workflows" / "sync-check.yml"


def load_module():
    """Load the companion automation without running its CLI."""
    spec = importlib.util.spec_from_file_location("dependabot_changelog", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DependabotChangelogTest(unittest.TestCase):
    """Keep the companion workflow limited to the trusted bot account."""

    def test_patch_version_increments_only_patch_component(self):
        module = load_module()
        self.assertEqual(module._next_version("## [0.6.3] (2026-09-17)\n"), (0, 6, 4))

    def test_entry_contains_original_pull_request_number(self):
        module = load_module()
        entry = module._insert_entry(
            "# Changelog\n\n## [0.6.3] (2026-09-17)\n",
            (0, 6, 4),
            80,
        )
        self.assertIn("## [0.6.4]", entry)
        self.assertIn("pull request #80", entry)

    def test_workflow_requires_successful_pull_request_run(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("github.event.workflow_run.event == 'pull_request'", text)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", text)
        self.assertIn("github.event.pull_request.user.id", SYNC_WORKFLOW.read_text(encoding="utf-8"))

    def test_dependabot_identity_is_immutable_numeric_id(self):
        module = load_module()
        self.assertEqual(module.DEPENDABOT_ID, 49699333)
        self.assertNotIn("pull_request.user.login", WORKFLOW.read_text(encoding="utf-8"))

    def test_non_dependabot_pull_request_has_no_companion(self):
        module = load_module()
        module._api_json = lambda _path: [{"number": 81, "user": {"id": 7}}]
        self.assertIsNone(module._find_dependabot_pr("abuzucom/time-chime", "a" * 40))


if __name__ == "__main__":
    unittest.main()
