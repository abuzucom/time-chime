"""The template upgrade plan reports predictable and unresolved base consumers."""
import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import plan_template_upgrade

GIT_IDENTITY = ("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid")
GATE_WORKFLOW = ".github/workflows/gate-integrity.yml"
COMPLIANCE_WORKFLOW = ".github/workflows/immutable-conflict-check.yml"
WORKFLOW_TEXT = "name: fixture\non: pull_request\njobs: {}\n"
UNRESOLVED_EXIT_CODE = 3


def _git(root: Path, *arguments: str) -> str:
    """Run one fixture Git command and return its output."""
    result = subprocess.run(["git", "-C", str(root), *GIT_IDENTITY, *arguments],
                            capture_output=True, text=True, check=True)
    return result.stdout.strip()


class BaseConsumerVerdictTest(unittest.TestCase):
    """A present base consumer yields a predicted failure or an unresolved entry."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        _git(self.root, "init", "--quiet")
        (self.root / "keep.py").write_text("y = 2\n", encoding="utf-8")
        (self.root / "hooks").mkdir()
        (self.root / "hooks" / "gate.py").write_text("x = 1\n", encoding="utf-8")

    def commit_base(self, workflows: tuple) -> str:
        """Commit the fixture with the named base workflows and return the base SHA."""
        for workflow in workflows:
            path = self.root / workflow
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(WORKFLOW_TEXT, encoding="utf-8")
        _git(self.root, "add", "--all")
        _git(self.root, "commit", "--quiet", "-m", "base")
        return _git(self.root, "rev-parse", "HEAD")

    def run_plan(self, base: str) -> tuple:
        """Run the planner against a base and return the exit code and output."""
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
            code = plan_template_upgrade.main(["--base", base], root=self.root)
        return code, output.getvalue()

    def test_protected_change_needs_label(self) -> None:
        base = self.commit_base((GATE_WORKFLOW,))
        (self.root / "hooks" / "gate.py").write_text("x = 2\n", encoding="utf-8")
        code, output = self.run_plan(base)
        self.assertEqual(code, plan_template_upgrade.EXPECTED_FAILURE, output)
        self.assertIn("gate-change-approved", output.split("Expected failures:")[1])
        self.assertIn("hooks/gate.py", output)

    def test_untracked_protected_file_counts(self) -> None:
        base = self.commit_base((GATE_WORKFLOW,))
        (self.root / "hooks" / "added.py").write_text("z = 3\n", encoding="utf-8")
        code, output = self.run_plan(base)
        self.assertEqual(code, plan_template_upgrade.EXPECTED_FAILURE, output)
        self.assertIn("hooks/added.py", output)

    def test_unprotected_change_needs_no_label(self) -> None:
        base = self.commit_base((GATE_WORKFLOW,))
        (self.root / "keep.py").write_text("y = 3\n", encoding="utf-8")
        code, output = self.run_plan(base)
        expected = output.split("Expected failures:")[1].split("Unresolved")[0]
        self.assertNotIn("gate-change-approved", expected)
        self.assertEqual(code, UNRESOLVED_EXIT_CODE, output)

    def test_absent_gate_workflow_needs_nothing(self) -> None:
        base = self.commit_base(())
        (self.root / "hooks" / "gate.py").write_text("x = 2\n", encoding="utf-8")
        code, output = self.run_plan(base)
        self.assertEqual(code, 0, output)
        self.assertIn("Unresolved consumers:\n- none", output)

    def test_present_consumer_is_unresolved(self) -> None:
        base = self.commit_base((COMPLIANCE_WORKFLOW,))
        code, output = self.run_plan(base)
        self.assertEqual(code, UNRESOLVED_EXIT_CODE, output)
        unresolved = output.split("Unresolved consumers:")[1].split("Merge order:")[0]
        self.assertIn("scripts/check_compliance_tree.py", unresolved)
        self.assertIn("Expected failures:\n- none", output)

    def test_failure_outranks_unresolved(self) -> None:
        base = self.commit_base((GATE_WORKFLOW, COMPLIANCE_WORKFLOW))
        (self.root / "hooks" / "gate.py").write_text("x = 2\n", encoding="utf-8")
        code, output = self.run_plan(base)
        self.assertEqual(code, plan_template_upgrade.EXPECTED_FAILURE, output)
        self.assertIn("scripts/check_compliance_tree.py",
                      output.split("Unresolved consumers:")[1])


if __name__ == "__main__":
    unittest.main()
