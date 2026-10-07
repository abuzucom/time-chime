#!/usr/bin/env python3
"""Exercise remaining unreached hook functions, error arms, and CLI entrypoints."""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOKS_DIR = REPO_ROOT / "hooks"
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(HOOKS_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))

import _bash_parser as bash_parser
import _cmd_parser as cmd_parser
import _gate_core as gate_core
import _platform_policy as platform_policy
import block_destructive_cmd as block_cmd
import block_destructive_powershell as block_ps
import block_infrastructure_access as block_infra
import enforce_branch_name as enforce_branch
import enforce_git_identity as enforce_id
import require_consent as require_consent


class BashParserEdgeCaseTest(unittest.TestCase):
    """Exercise unreached statement paths in _bash_parser.py."""

    def test_env_split_value_prefixes(self):
        self.assertEqual(bash_parser._env_split_value("-S"), ("", True))
        self.assertEqual(bash_parser._env_split_value("--split-string"), ("", True))
        self.assertEqual(bash_parser._env_split_value("-Sgit"), ("git", True))
        self.assertEqual(bash_parser._env_split_value("--split-string=git"), ("git", True))
        self.assertEqual(bash_parser._env_split_value("--other"), ("", False))

    def test_redirect_targets_inline_chevron(self):
        tokens = ["echo", "value", "1>out.txt", "2>err.txt"]
        targets = bash_parser.redirect_targets(tokens)
        self.assertIn("out.txt", targets)
        self.assertIn("err.txt", targets)

    def test_git_write_operation_ambiguous_contexts(self):
        # Incomplete env -S tokenization
        contexts = bash_parser.git_write_operation(
            'env -S "git commit unterminated',
            lambda args, cwd, a: {},
            str(REPO_ROOT),
        )
        self.assertTrue(any(c.get("label") == "unresolved env -S command" for c in contexts))

        # Unparseable command line with recovered git token
        contexts = bash_parser.git_write_operation(
            'git commit "unterminated quote',
            lambda args, cwd, a: {"label": "valid"},
            str(REPO_ROOT),
        )
        self.assertTrue(any(c.get("label") == "unparseable command" for c in contexts))


class CmdParserEdgeCaseTest(unittest.TestCase):
    """Exercise unreached statement paths in _cmd_parser.py."""

    def test_append_segment_empty_noop(self):
        tokens = []
        segments = []
        cmd_parser.append_segment(tokens, segments)
        self.assertEqual(segments, [])

    def test_contains_dynamic_expansion_odd_markers(self):
        self.assertTrue(cmd_parser.contains_dynamic_expansion("echo %unclosed"))
        self.assertTrue(cmd_parser.contains_dynamic_expansion("echo !unclosed"))
        self.assertTrue(cmd_parser.contains_dynamic_expansion("echo %var% %second%"))

    def test_parse_cmd_command_validation_branches(self):
        self.assertEqual(cmd_parser.parse_cmd_command(12345).status, "malformed")
        self.assertEqual(cmd_parser.parse_cmd_command("x" * 70000).status, "input_too_large")
        self.assertEqual(cmd_parser.parse_cmd_command("   \t  \n").status, "empty")

    def test_scan_cmd_characters_escaping_and_redirects(self):
        res1 = cmd_parser.scan_cmd_characters("dir >&2")
        self.assertEqual(res1.status, "complete")

        res2 = cmd_parser.scan_cmd_characters("dir ^> file")
        self.assertEqual(res2.status, "complete")

        res3 = cmd_parser.scan_cmd_characters("dir ^")
        self.assertEqual(res3.status, "malformed")

        res4 = cmd_parser.scan_cmd_characters('dir "unterminated')
        self.assertEqual(res4.status, "malformed")

        res5 = cmd_parser.scan_cmd_characters("  &  ")
        self.assertEqual(res5.status, "empty")


class PlatformPolicyEdgeCaseTest(unittest.TestCase):
    """Exercise unreached statement paths in _platform_policy.py."""

    def test_is_remote_endpoint(self):
        self.assertFalse(platform_policy.is_remote_endpoint("C:\\local\\path", "win32"))
        self.assertTrue(platform_policy.is_remote_endpoint("https://example.com/repo"))
        self.assertTrue(platform_policy.is_remote_endpoint("[2001:db8::1]:8080/path"))
        self.assertTrue(platform_policy.is_remote_endpoint("user@remote.host:file.txt"))
        self.assertFalse(platform_policy.is_remote_endpoint("dir/file:name"))

    def test_classify_transfer_direction(self):
        verdict, _ = platform_policy.classify_transfer_direction(["single_arg"])
        self.assertEqual(verdict, "ask")

        verdict, _ = platform_policy.classify_transfer_direction(["local_file", "user@remote:dest"])
        self.assertEqual(verdict, "deny")

        verdict, _ = platform_policy.classify_transfer_direction(["user@remote:source", "local_file"])
        self.assertEqual(verdict, "ask")

        verdict, _ = platform_policy.classify_transfer_direction(["local_src", "local_dst"])
        self.assertEqual(verdict, "")

    def test_classify_macos_command(self):
        cases = [
            ("launchctl", ["bootstrap", "gui/501", "service.plist"], "deny"),
            ("launchctl", ["list"], "ask"),
            ("spctl", ["--master-disable"], "deny"),
            ("xattr", ["-d", "com.apple.quarantine", "file"], "deny"),
            ("tccutil", ["reset", "All"], "deny"),
            ("diskutil", ["list"], "deny"),
            ("tmutil", ["delete", "snapshot"], "deny"),
            ("security", ["delete-keychain", "login.keychain"], "deny"),
            ("security", ["find-certificate"], "ask"),
            ("unknown_cmd", [], ""),
        ]
        for program, args, expected in cases:
            with self.subTest(program=program):
                verdict, _ = platform_policy.classify_macos_command(program, args)
                self.assertEqual(verdict, expected)


class BlockDestructiveCmdCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in block_destructive_cmd.py."""

    def test_classify_interpreter(self):
        verdict, _ = block_cmd.classify_interpreter("powershell", ("-EncodedCommand", "invalid"))
        self.assertEqual(verdict, "deny")

        verdict, _ = block_cmd.classify_interpreter("bash", ("-c", "rm -rf /"))
        self.assertEqual(verdict, "deny")

        verdict, _ = block_cmd.classify_interpreter("sh", ())
        self.assertEqual(verdict, "ask")

    def test_classify_service_or_task(self):
        v1, _ = block_cmd.classify_service_or_task("sc", ("delete", "MyService"))
        self.assertEqual(v1, "deny")

        v2, _ = block_cmd.classify_service_or_task("sc", ("query", "MyService"))
        self.assertEqual(v2, "ask")

        v3, _ = block_cmd.classify_service_or_task("schtasks", ("/delete", "/tn", "MyTask"))
        self.assertEqual(v3, "deny")

        v4, _ = block_cmd.classify_service_or_task("schtasks", ("/query",))
        self.assertEqual(v4, "ask")

    def test_classify_named_program(self):
        v1, _ = block_cmd.classify_named_program("diskpart", "diskpart", ())
        self.assertEqual(v1, "deny")

        v2, _ = block_cmd.classify_named_program("psexec", "psexec", ())
        self.assertEqual(v2, "deny")

        v3, _ = block_cmd.classify_named_program("whoami", "whoami", ())
        self.assertEqual(v3, "ask")

        v4, _ = block_cmd.classify_named_program("call", "call", ())
        self.assertEqual(v4, "deny")

        v5, _ = block_cmd.classify_named_program("run.bat", "run", ())
        self.assertEqual(v5, "ask")

        v6, _ = block_cmd.classify_named_program("notepad.exe", "notepad", ())
        self.assertEqual(v6, "")

    def test_classify_cmd_command_empty(self):
        v, _ = block_cmd.classify_cmd_command("   ")
        self.assertEqual(v, "")

    def test_main_branches(self):
        # Tool name not in CMD tools -> 0
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(json.dumps({"tool_name": "Bash", "tool_input": {}}))
            self.assertEqual(block_cmd.main(), 0)

            # tool_input not dict -> 2
            sys.stdin = io.StringIO(json.dumps({"tool_name": "Cmd", "tool_input": "invalid"}))
            self.assertEqual(block_cmd.main(), 2)

            # command not string -> 2
            sys.stdin = io.StringIO(json.dumps({"tool_name": "Cmd", "tool_input": {"command": 123}}))
            self.assertEqual(block_cmd.main(), 2)

            # command with no decision -> 0
            sys.stdin = io.StringIO(json.dumps({
                "tool_name": "Cmd",
                "tool_input": {"command": "echo clean"},
                "cwd": str(REPO_ROOT),
            }))
            self.assertEqual(block_cmd.main(), 0)
        finally:
            sys.stdin = old_stdin


class BlockDestructivePowershellCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in block_destructive_powershell.py."""

    def test_argument_list_and_interpreter_verdicts(self):
        v1, _ = block_ps._argument_list_verdict("cmd", [], 0)
        self.assertEqual(v1, "")

        v2, _ = block_ps._argument_list_verdict("cmd", ['"unterminated'], 0)
        self.assertEqual(v2, "ask")

        v3, _ = block_ps._argument_list_verdict("cmd", ["/c dir"], 20)
        self.assertEqual(v3, "deny")

        v4, _ = block_ps._interpreter_verdict("cmd", ["/c", "dir"], 20)
        self.assertEqual(v4, "deny")

        v5, _ = block_ps._payload_verdict("-c", [], 0)
        self.assertEqual(v5, "deny")

    def test_environment_reference_naming(self):
        self.assertEqual(block_ps._environment_reference_name("${env:GIT_DIR}"), "GIT_DIR")
        self.assertEqual(block_ps._environment_reference_name("$env:GIT_DIR"), "GIT_DIR")
        self.assertEqual(block_ps._environment_reference_name("env:GIT_DIR"), "GIT_DIR")
        self.assertEqual(block_ps._environment_reference_name("plain_var"), "")

    def test_named_program_and_program_verdicts(self):
        # Redirection test write
        v1 = block_ps._program_verdict([">", "tests/out.txt"], ["tests/out.txt"], 0)
        self.assertEqual(v1[0], "ask")

        # Invoke-Expression nesting bound
        v2 = block_ps._program_verdict(["iex", "Remove-Item -Recurse /"], [], 20)
        self.assertEqual(v2[0], "deny")

    def test_powershell_cli_policy(self):
        cases = [
            ("auditpol", ["/clear"], "deny"),
            ("wevtutil", ["cl", "System"], "deny"),
            ("manage-bde", ["-status"], ""),
            ("manage-bde", ["-off", "C:"], "deny"),
            ("bcdedit", ["/set", "test"], "deny"),
            ("secedit", ["/configure", "db"], "deny"),
            ("secedit", ["/analyze"], "ask"),
            ("route", ["add", "0.0.0.0"], "deny"),
            ("route", ["print"], "ask"),
            ("reg", ["query", "HKLM\\SAM"], "deny"),
            ("winrs", ["-r:server", "cmd"], "deny"),
            ("schtasks", ["/create"], "deny"),
        ]
        for name, args, expected in cases:
            with self.subTest(name=name):
                verdict, _ = gate_core._powershell_cli_policy(name, args)
                self.assertEqual(verdict, expected)

    def test_powershell_path_and_indirect_policy(self):
        v1, _ = gate_core._powershell_path_policy("copy-item", ["src", "//remote/unc"], [])
        self.assertEqual(v1, "deny")

        v2, _ = gate_core._powershell_path_policy("copy-item", ["src", "C:\\Windows\\System32"], [])
        self.assertEqual(v2, "deny")

        v3, _ = gate_core._powershell_path_policy("copy-item", ["$dynamic/path", "dst"], [])
        self.assertEqual(v3, "ask")

        v4, _ = gate_core._powershell_path_policy("copy-item", ["*.txt", "dst"], [])
        self.assertEqual(v4, "ask")

        v5, _ = gate_core._powershell_path_policy("copy-item", ["src", "dst", "-Recurse"], [])
        self.assertEqual(v5, "ask")

        v6, _ = gate_core._powershell_path_policy("clear-content", ["file.txt"], [])
        self.assertEqual(v6, "ask")

        # Indirect
        v7, _ = gate_core._powershell_indirect_policy("new-object", "-comobject wscript.shell", [])
        self.assertEqual(v7, "deny")

        v8, _ = gate_core._powershell_indirect_policy("new-object", "System.Random", [])
        self.assertEqual(v8, "ask")

        v9, _ = gate_core._powershell_indirect_policy("invoke-command", "", ["-ComputerName", "server"])
        self.assertEqual(v9, "deny")

        v10, _ = gate_core._powershell_indirect_policy("import-module", "", ["$dynamic"])
        self.assertEqual(v10, "deny")

        v11, _ = gate_core._powershell_indirect_policy("start-process", "", ["$dynamic"])
        self.assertEqual(v11, "deny")

    def test_powershell_state_web_and_script_policy(self):
        v1, _ = gate_core._powershell_state_policy("set-itemproperty", "hklm:\\sam")
        self.assertEqual(v1, "deny")

        v2, _ = gate_core._powershell_state_policy("set-itemproperty", "hkcu:\\software")
        self.assertEqual(v2, "ask")

        v3, _ = gate_core._powershell_state_policy("remove-item", "cert:\\localmachine")
        self.assertEqual(v3, "deny")

        v4, _ = gate_core._powershell_state_policy("get-childitem", "cert:\\localmachine")
        self.assertEqual(v4, "ask")

        v5, _ = gate_core._powershell_state_policy("new-psdrive", "unc \\\\server\\share")
        self.assertEqual(v5, "deny")

        # Web
        v6, _ = gate_core._powershell_web_policy("invoke-webrequest", ["http://site/file.exe"])
        self.assertEqual(v6, "deny")

        v7, _ = gate_core._powershell_web_policy("start-bitstransfer", ["-TransferType", "Upload", "http://site"])
        self.assertEqual(v7, "deny")

        v8, _ = gate_core._powershell_web_policy("invoke-webrequest", ["-Body", "data", "http://site"])
        self.assertEqual(v8, "deny")

        v9, _ = gate_core._powershell_web_policy("invoke-webrequest", ["-Method", "POST", "http://site"])
        self.assertEqual(v9, "deny")

        # Script
        v10, _ = gate_core._powershell_script_policy("//remote/share/script.ps1", "script.ps1", [])
        self.assertEqual(v10, "deny")

        v11, _ = gate_core._powershell_script_policy("script.ps1", "script.ps1", ["$ambiguous"])
        self.assertEqual(v11, "deny")

    def test_main_branches(self):
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(json.dumps({"tool_name": "Bash", "tool_input": {}}))
            self.assertEqual(block_ps.main(), 0)

            sys.stdin = io.StringIO(json.dumps({"tool_name": "PowerShell", "tool_input": "invalid"}))
            self.assertEqual(block_ps.main(), 2)

            sys.stdin = io.StringIO(json.dumps({"tool_name": "PowerShell", "tool_input": {"command": 123}}))
            self.assertEqual(block_ps.main(), 2)

            sys.stdin = io.StringIO(json.dumps({
                "tool_name": "PowerShell",
                "tool_input": {"command": "Write-Output clean"},
                "cwd": str(REPO_ROOT),
            }))
            self.assertEqual(block_ps.main(), 0)
        finally:
            sys.stdin = old_stdin


class BlockInfrastructureAccessCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in block_infrastructure_access.py."""

    def test_path_and_content_helpers(self):
        self.assertEqual(block_infra._path({"path": "foo/bar"}), "foo/bar")
        self.assertEqual(block_infra._path({}), "")

        content = block_infra._content({
            "content": "abc",
            "edits": [{"new_string": "def"}],
        })
        self.assertIn("abc", content)
        self.assertIn("def", content)

    def test_search_denied_branches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            k8s_file = temp_path / "chart.yaml"
            k8s_file.write_text("apiVersion: v1\nkind: Chart\n", encoding="utf-8")

            self.assertTrue(block_infra._search_denied("Grep", {"path": str(temp_path), "include": "*.yaml"}, str(temp_path)))
            self.assertTrue(block_infra._search_denied("Glob", {"path": str(temp_path), "pattern": "*.yaml"}, str(temp_path)))

    def test_main_branches(self):
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(json.dumps({"tool_name": "OtherTool"}))
            self.assertEqual(block_infra.main(), 0)

            sys.stdin = io.StringIO(json.dumps({"tool_name": "Read", "tool_input": "malformed"}))
            self.assertEqual(block_infra.main(), 2)

            sys.stdin = io.StringIO(json.dumps({
                "tool_name": "Read",
                "tool_input": {"file_path": "README.md"},
                "cwd": str(REPO_ROOT),
            }))
            self.assertEqual(block_infra.main(), 0)
        finally:
            sys.stdin = old_stdin


class GateCoreCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in _gate_core.py."""

    def test_account_delete_command(self):
        self.assertTrue(gate_core._account_delete_command("pw", ["userdel", "alice"]))
        self.assertTrue(gate_core._account_delete_command("pw", ["groupdel", "staff"]))
        self.assertTrue(gate_core._account_delete_command("net", ["user", "alice", "/delete"]))
        self.assertTrue(gate_core._account_delete_command("net", ["localgroup", "staff", "/delete"]))
        self.assertTrue(gate_core._account_delete_command("sysadminctl", ["-deleteuser", "alice"]))
        self.assertTrue(gate_core._account_delete_command("dscl", [".", "-delete", "/users/alice"]))
        self.assertTrue(gate_core._account_delete_command("wmic", ["useraccount", "where", "name='alice'", "delete"]))
        self.assertFalse(gate_core._account_delete_command("other", []))

    def test_git_clean_verdict(self):
        self.assertEqual(gate_core._git_clean_verdict(["-n"]), ("", ""))
        self.assertEqual(gate_core._git_clean_verdict(["--dry-run"]), ("", ""))
        v, _ = gate_core._git_clean_verdict(["-fdx"])
        self.assertEqual(v, "ask")

    def test_infrastructure_path_detection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            k8s_manifest = temp_path / "deploy.yaml"
            k8s_manifest.write_text("apiVersion: apps/v1\nkind: Deployment\n", encoding="utf-8")
            self.assertTrue(gate_core.is_protected_infrastructure_path(str(k8s_manifest)))

            tf_file = temp_path / "main.tf"
            self.assertTrue(gate_core.is_protected_infrastructure_path(str(tf_file)))

            bicep_file = temp_path / "infra.bicep"
            self.assertTrue(gate_core.is_protected_infrastructure_path(str(bicep_file)))

            pulumi_file = temp_path / "pulumi.yaml"
            self.assertTrue(gate_core.is_protected_infrastructure_path(str(pulumi_file)))

            sam_file = temp_path / "samconfig.toml"
            self.assertTrue(gate_core.is_protected_infrastructure_path(str(sam_file)))

            self.assertTrue(gate_core.tree_contains_protected_infrastructure(str(temp_path)))

    def test_volume_and_device_verdicts(self):
        v1, _ = gate_core.device_write_verdict("diskpart", [])
        self.assertEqual(v1, "deny")

        v2, _ = gate_core.volume_verdict(True, ["/mnt/drive/data"])
        self.assertEqual(v2, "ask")

        v3, _ = gate_core.device_write_verdict("dd", ["of=/dev/sda"])
        self.assertEqual(v3, "deny")

        v4, _ = gate_core.posix_delete_verdict(["-rf", "/"])
        self.assertEqual(v4, "deny")

        v5, _ = gate_core.schedule_verdict("crontab", ["-r"])
        self.assertEqual(v5, "deny")

        v6, _ = gate_core.su_target_verdict(["-", "root"])
        self.assertEqual(v6, "deny")

        v7, _ = gate_core.remote_execution_verdict([["curl"], ["bash"]])
        self.assertEqual(v7, "deny")

        v8, _ = gate_core.logging_verdict("vim-cmd", ["destroy"])
        self.assertEqual(v8, "deny")

    def test_system_root_and_mentions_device(self):
        self.assertTrue(gate_core._is_system_root("/"))
        self.assertTrue(gate_core._is_system_root("/etc"))
        self.assertTrue(gate_core._is_drive_root("C:\\"))
        self.assertTrue(gate_core._mentions_device(["/dev/sda"]))
        self.assertFalse(gate_core._mentions_device(["plain_file"]))

    def test_read_payload_and_sanitize(self):
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO("")
            self.assertEqual(gate_core.read_payload(empty_is_session_start=True), {})
            sys.stdin = io.StringIO("not-json")
            self.assertIsNone(gate_core.read_payload())
        finally:
            sys.stdin = old_stdin

        sanitized = gate_core.sanitize("hello\x00world\u200b" + "a" * 200)
        self.assertTrue(sanitized.endswith("...[truncated]"))
        self.assertIn("\\x00", sanitized)

    def test_resolved_under(self):
        self.assertIsNotNone(gate_core.resolved_under(str(REPO_ROOT), "README.md"))
        self.assertIsNone(gate_core.resolved_under(str(REPO_ROOT), "../../../outside.txt"))


class EnforceBranchAndIdentityCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in enforce_branch_name.py and enforce_git_identity.py."""

    def test_enforce_branch_write_content(self):
        content = enforce_branch._write_content({
            "new_source": "abc",
            "edits": [{"new_string": "def"}],
        })
        self.assertIn("abc", content)
        self.assertIn("def", content)

    def test_enforce_branch_file_metadata(self):
        self.assertTrue(enforce_branch.file_write_names_prohibited_metadata(
            {"file_path": ".git/refs/heads/claude/test"},
            str(REPO_ROOT),
        ))

    def test_enforce_branch_main_entrypoint(self):
        old_stdin = sys.stdin
        old_argv = sys.argv
        try:
            sys.stdin = io.StringIO(json.dumps({"tool_name": "AskUserQuestion", "tool_input": {}}))
            sys.argv = ["enforce_branch_name.py", "--client", "claude"]
            self.assertEqual(enforce_branch.main(), 0)
        finally:
            sys.stdin = old_stdin
            sys.argv = old_argv

    def test_enforce_identity_handle_pre_tool_use(self):
        res1 = enforce_id._handle_pre_tool_use({"tool_name": "Read"}, str(REPO_ROOT))
        self.assertEqual(res1, 0)

        res2 = enforce_id._handle_pre_tool_use({"tool_name": "Bash", "tool_input": "malformed"}, str(REPO_ROOT))
        self.assertEqual(res2, 2)


class RequireConsentCoverageTest(unittest.TestCase):
    """Exercise unreached statement paths in require_consent.py."""

    def test_require_consent_helpers(self):
        self.assertTrue(require_consent.escapes_root("../outside/file.txt", str(REPO_ROOT)))
        self.assertFalse(require_consent.escapes_root(str(REPO_ROOT / "README.md"), str(REPO_ROOT)))

        self.assertEqual(require_consent.given_path({"file_path": "foo"}), "foo")
        self.assertEqual(require_consent.given_path({"notebook_path": "bar"}), "bar")
        self.assertEqual(require_consent.given_path({}), "")

    def test_require_consent_main_entrypoint(self):
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(json.dumps({"tool_name": "Read", "tool_input": {}}))
            self.assertEqual(require_consent.main(), 0)

            sys.stdin = io.StringIO(json.dumps({
                "tool_name": "Write",
                "tool_input": {"file_path": "nonexistent_temp_file.txt"},
                "cwd": str(REPO_ROOT),
            }))
            self.assertEqual(require_consent.main(), 0)
        finally:
            sys.stdin = old_stdin


if __name__ == "__main__":
    unittest.main()
