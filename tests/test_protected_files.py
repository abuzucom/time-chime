import unittest

from scripts.check_protected_files import (
    is_protected,
    requires_owner_approval,
    resolve_policy_path,
    validate_policy,
)


class ProtectedFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = {
            "owner": "itsjustatank",
            "allow_owner_authored": True,
            "max_file_pages": 50,
            "max_review_pages": 50,
            "protected_file_names": ["AGENTS.md", "package.json"],
            "protected_prefixes": [".github/", "src/", "scripts/"],
            "protected_globs": ["public/_headers"],
        }

    def test_protects_instructions_automation_and_source(self) -> None:
        for path in (
            "AGENTS.md",
            ".github/workflows/security-headers.yml",
            "scripts/check-headers.mjs",
            "src/lib/http/security-headers.ts",
            "public/_headers",
        ):
            with self.subTest(path=path):
                self.assertTrue(is_protected(path, self.policy))

    def test_leaves_unrelated_documentation_unprotected(self) -> None:
        self.assertFalse(is_protected("README.md", self.policy))

    def test_owner_authored_change_does_not_require_self_approval(self) -> None:
        event = {"pull_request": {"user": {"login": "itsjustatank"}}}
        self.assertFalse(requires_owner_approval(event, self.policy))

    def test_agent_authored_change_requires_owner_approval(self) -> None:
        event = {"pull_request": {"user": {"login": "automation-bot"}}}
        self.assertTrue(requires_owner_approval(event, self.policy))

    def test_rejects_invalid_limits_and_paths(self) -> None:
        self.policy["max_file_pages"] = 0
        with self.assertRaises(RuntimeError):
            validate_policy(self.policy)
        with self.assertRaises(RuntimeError):
            resolve_policy_path("../outside-policy.json")


if __name__ == "__main__":
    unittest.main()
