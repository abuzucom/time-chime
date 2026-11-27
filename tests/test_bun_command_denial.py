"""Exercise the command gate for bun invocations.

The shared command execution gate denies every bun invocation as opaque
execution. The Makefile is the route that an agent uses for the application
commands.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tests.test_enforce_branch_name import HOOK_PATH

LOCKFILE_COMMAND = "bun install --lockfile-only"
HOOK_TIMEOUT_SECONDS = 15
DENIED_EXIT_CODE = 2


class BunCommandDenialTest(unittest.TestCase):
    """Send candidate commands to the real hook without executing candidates."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        admin = self.root / ".git"
        (admin / "objects").mkdir(parents=True)
        (admin / "refs" / "heads").mkdir(parents=True)
        (admin / "HEAD").write_text("ref: refs/heads/fix/example\n", encoding="utf-8")
        (admin / "config").write_text("[core]\nbare = false\n", encoding="utf-8")
        global_config = self.root / "global.config"
        global_config.write_text("", encoding="utf-8")
        self.environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.environment.update({"CLAUDE_PROJECT_DIR": str(self.root), "GIT_CONFIG_NOSYSTEM": "1",
                                 "GIT_CONFIG_GLOBAL": str(global_config)})

    def run_candidate(self, command: str, mode: str = "default") -> subprocess.CompletedProcess:
        """Invoke the hook with isolated repository metadata and configuration."""
        payload = {"hook_event_name": "PreToolUse", "permission_mode": mode,
                   "tool_name": "Bash", "tool_input": {"command": command}}
        return subprocess.run(
            [sys.executable, str(HOOK_PATH)], input=json.dumps(payload),
            env=self.environment, capture_output=True, text=True,
            timeout=HOOK_TIMEOUT_SECONDS, check=False,
        )

    def test_lockfile_command_stays_denied(self) -> None:
        """Verify the lockfile command denies as opaque execution."""
        result = self.run_candidate(LOCKFILE_COMMAND)
        self.assertEqual(result.returncode, DENIED_EXIT_CODE, result.stdout)
        self.assertIn("Opaque command execution", result.stderr)

    def test_other_bun_commands_stay_denied(self) -> None:
        """Verify every other bun invocation remains opaque execution."""
        for command in ("bun install", "bun add left-pad", "bun run build",
                        "bun install --lockfile-only --force", "bunx left-pad",
                        "bun run test", "bun run lint"):
            with self.subTest(command=command):
                result = self.run_candidate(command)
                self.assertEqual(result.returncode, DENIED_EXIT_CODE, result.stdout)
                self.assertIn("Opaque command execution", result.stderr)


if __name__ == "__main__":
    unittest.main()
