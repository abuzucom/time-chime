"""Require current owner approval for sensitive pull-request changes."""

from __future__ import annotations

import fnmatch
import json
import os
import sys
import urllib.request
from pathlib import Path, PurePosixPath
from typing import Any


API_PAGE_SIZE = 100
HTTP_TIMEOUT_SECONDS = 30
MAX_ALLOWED_PAGES = 50
REPOSITORY_NAME_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
)


def get_repository_root() -> Path:
    return Path(__file__).resolve().parent.parent


def safe_log_text(value: str) -> str:
    return value.replace("\r", " ").replace("\n", " ")


def resolve_policy_path(path: str) -> Path:
    root = get_repository_root()
    candidate = Path(path)
    resolved = (candidate if candidate.is_absolute() else root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise RuntimeError("protected-file policy must stay inside the repository") from error
    return resolved


def validate_policy(policy: dict[str, Any]) -> None:
    owner = policy.get("owner")
    if not isinstance(owner, str) or not owner:
        raise RuntimeError("owner must be a non-empty string")
    if not isinstance(policy.get("allow_owner_authored"), bool):
        raise RuntimeError("allow_owner_authored must be a boolean")
    for key in ("max_file_pages", "max_review_pages"):
        value = policy.get(key)
        if not isinstance(value, int) or isinstance(value, bool):
            raise RuntimeError(f"{key} must be an integer")
        if not 1 <= value <= MAX_ALLOWED_PAGES:
            raise RuntimeError(f"{key} must be between 1 and {MAX_ALLOWED_PAGES}")
    for key in ("protected_file_names", "protected_prefixes", "protected_globs"):
        values = policy.get(key)
        if not isinstance(values, list) or not all(
            isinstance(value, str) and value for value in values
        ):
            raise RuntimeError(f"{key} must be a list of non-empty strings")


def load_event() -> dict[str, Any]:
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as event_file:
        value = json.load(event_file)
    if not isinstance(value, dict):
        raise RuntimeError("GitHub event must be a JSON object")
    return value


def load_policy() -> dict[str, Any]:
    path = os.environ.get("PROTECTED_FILES_POLICY")
    policy: dict[str, Any] = {
        "owner": "itsjustatank",
        "allow_owner_authored": True,
        "max_file_pages": MAX_ALLOWED_PAGES,
        "max_review_pages": MAX_ALLOWED_PAGES,
        "protected_file_names": [],
        "protected_prefixes": [],
        "protected_globs": [],
    }
    if path:
        with resolve_policy_path(path).open(encoding="utf-8") as policy_file:
            configured = json.load(policy_file)
        if not isinstance(configured, dict):
            raise RuntimeError("protected-file policy must be a JSON object")
        policy.update(configured)
    owner = os.environ.get("PROTECTED_FILES_OWNER")
    if owner:
        policy["owner"] = owner
    if "PROTECTED_FILES_ALLOW_OWNER_AUTHORED" in os.environ:
        policy["allow_owner_authored"] = os.environ[
            "PROTECTED_FILES_ALLOW_OWNER_AUTHORED"
        ].lower() == "true"
    validate_policy(policy)
    return policy


def is_protected(path: str, policy: dict[str, Any]) -> bool:
    normalized = path.replace("\\", "/").lstrip("/")
    name = PurePosixPath(normalized).name
    if name in policy["protected_file_names"]:
        return True
    if any(normalized.startswith(prefix) for prefix in policy["protected_prefixes"]):
        return True
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in policy["protected_globs"])


def get_github_json(path: str) -> Any:
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


def get_pull_request_details(event: dict[str, Any]) -> tuple[str, int, str]:
    pull_request = event.get("pull_request")
    repository = event.get("repository", {})
    if not isinstance(pull_request, dict) or not isinstance(repository, dict):
        raise RuntimeError("pull request event data is missing")
    repository_name = repository.get("full_name")
    number = pull_request.get("number")
    head = pull_request.get("head")
    head_sha = head.get("sha") if isinstance(head, dict) else None
    parts = repository_name.split("/") if isinstance(repository_name, str) else []
    if len(parts) != 2 or not all(
        part and all(character in REPOSITORY_NAME_CHARS for character in part)
        for part in parts
    ):
        raise RuntimeError("pull request repository name is invalid")
    if not isinstance(number, int) or isinstance(number, bool) or number < 1:
        raise RuntimeError("pull request number must be positive")
    if not isinstance(head_sha, str) or not head_sha:
        raise RuntimeError("pull request head SHA is missing")
    return repository_name, number, head_sha


def get_changed_files(event: dict[str, Any], policy: dict[str, Any]) -> list[str]:
    repository, number, _ = get_pull_request_details(event)
    files: list[str] = []
    for page in range(1, policy["max_file_pages"] + 1):
        batch = get_github_json(
            f"/repos/{repository}/pulls/{number}/files?per_page={API_PAGE_SIZE}&page={page}"
        )
        if not isinstance(batch, list):
            raise RuntimeError("GitHub returned an invalid changed-files response")
        for item in batch:
            if not isinstance(item, dict) or not isinstance(item.get("filename"), str):
                raise RuntimeError("GitHub returned an invalid changed-file entry")
            files.append(item["filename"])
        if len(batch) < API_PAGE_SIZE:
            return files
    raise RuntimeError("pull request file list exceeded the configured limit")


def has_current_owner_approval(event: dict[str, Any], policy: dict[str, Any]) -> bool:
    repository, number, head_sha = get_pull_request_details(event)
    owner = str(policy["owner"]).lower()
    for page in range(1, policy["max_review_pages"] + 1):
        reviews = get_github_json(
            f"/repos/{repository}/pulls/{number}/reviews?per_page={API_PAGE_SIZE}&page={page}"
        )
        if not isinstance(reviews, list):
            raise RuntimeError("GitHub returned an invalid reviews response")
        for review in reviews:
            if not isinstance(review, dict):
                raise RuntimeError("GitHub returned an invalid review entry")
            user = review.get("user")
            login = user.get("login") if isinstance(user, dict) else None
            if (
                isinstance(login, str)
                and login.lower() == owner
                and review.get("state") == "APPROVED"
                and review.get("commit_id") == head_sha
            ):
                return True
        if len(reviews) < API_PAGE_SIZE:
            return False
    raise RuntimeError("review list exceeded the configured limit")


def requires_owner_approval(event: dict[str, Any], policy: dict[str, Any]) -> bool:
    pull_request = event.get("pull_request")
    user = pull_request.get("user") if isinstance(pull_request, dict) else None
    author = user.get("login", "") if isinstance(user, dict) else ""
    if not isinstance(author, str) or not author:
        raise RuntimeError("pull request author is missing")
    return not (
        policy["allow_owner_authored"]
        and author.lower() == str(policy["owner"]).lower()
    )


def main() -> int:
    event = load_event()
    policy = load_policy()
    protected = sorted(
        path for path in get_changed_files(event, policy) if is_protected(path, policy)
    )
    if not protected:
        print("No protected files changed.")
        return 0
    print("Protected files changed:")
    print("\n".join(f"- {safe_log_text(path)}" for path in protected))
    owner = safe_log_text(str(policy["owner"]))
    if not requires_owner_approval(event, policy):
        print(f"Owner-authored PR from @{owner}; no self-approval required.")
        return 0
    if has_current_owner_approval(event, policy):
        print(f"Current approval from @{owner} found.")
        return 0
    print(f"Approval from @{owner} on the current commit is required.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
