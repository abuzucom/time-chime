#!/usr/bin/env python3
"""Test that package.json pins dependencies at or above their patched versions."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON_PATH = ROOT / "package.json"
# Each floor is the first patched release named by the cited advisory.
PATCHED_VERSION_FLOORS = {
    # GHSA-qx66-fv34-fjm8: reflected XSS in server-function responses.
    "@tanstack/react-start": (1, 168, 60),
    # @tanstack/react-start 1.168.60 pins @tanstack/react-router 1.170.41.
    "@tanstack/react-router": (1, 170, 41),
    # @tanstack/start-plugin-core 1.171.49 pins @tanstack/router-plugin 1.168.42.
    "@tanstack/router-plugin": (1, 168, 42),
    # GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg.
    "vite": (8, 3, 3),
    # GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized collections.
    "zod": (4, 6, 6),
}


def parse_release_version(version_text: str) -> tuple[int, int, int]:
    """Return the major, minor, and patch numbers of an exact version pin."""
    release_text = version_text.split("-", 1)[0]
    major, minor, patch = (int(part) for part in release_text.split("."))
    return major, minor, patch


def read_declared_versions() -> dict[str, str]:
    """Return the merged dependency and devDependency pins from package.json."""
    manifest = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    declared_versions = dict(manifest.get("dependencies", {}))
    declared_versions.update(manifest.get("devDependencies", {}))
    return declared_versions


class DependencySecurityFloorTest(unittest.TestCase):
    """Advisory-affected packages must stay at or above their patched release."""

    def test_pins_meet_patched_version_floors(self) -> None:
        """Verify each advisory-affected pin meets its patched version floor."""
        declared_versions = read_declared_versions()
        for package_name, version_floor in PATCHED_VERSION_FLOORS.items():
            with self.subTest(package=package_name):
                self.assertIn(package_name, declared_versions)
                declared = parse_release_version(declared_versions[package_name])
                self.assertGreaterEqual(declared, version_floor)


if __name__ == "__main__":
    unittest.main()
