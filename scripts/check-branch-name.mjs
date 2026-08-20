#!/usr/bin/env node
/**
 * Enforces the `<type>/<kebab-description>` branch naming convention from
 * AGENTS.md. Never flags `main`, `master`, or a detached HEAD, which
 * `git rev-parse --abbrev-ref HEAD` reports as the literal string "HEAD".
 *
 * Reads the pull request head from `GITHUB_HEAD_REF` when set, so a CI run
 * checks the branch under review rather than the merge commit it is on.
 *
 * Usage:
 *   node scripts/check-branch-name.mjs                    # current branch
 *   node scripts/check-branch-name.mjs feat/some-change   # explicit branch
 *   node scripts/check-branch-name.mjs --prefixes feat,fix # custom prefixes
 *
 * Exits 1 on a mismatch. Ported from abuzucom/agents
 * scripts/check_branch_name.py (1.11.0).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_PREFIXES = ["feat", "fix", "chore", "docs", "test"];
const EXEMPT_BRANCHES = new Set(["main", "master", "HEAD"]);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

/** Build the `<type>/<kebab-description>` pattern for the given prefixes. */
function patternFor(prefixes) {
  const group = prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`^(?:${group})/[a-z0-9]+(?:-[a-z0-9]+)*$`);
}

/** One message when `branch` breaks the convention, otherwise an empty list. */
export function findViolations(branch, prefixes = DEFAULT_PREFIXES) {
  if (!branch || EXEMPT_BRANCHES.has(branch)) return [];
  if (patternFor(prefixes).test(branch)) return [];
  const allowed = prefixes.map((prefix) => `${prefix}/`).join(", ");
  return [`branch '${branch}' does not match <type>/<kebab-description> (${allowed})`];
}

// The PR head in CI, or the locally checked-out branch. A git failure yields
// an empty string, which findViolations treats as nothing to check.
function currentBranch() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const flagIndex = argv.indexOf("--prefixes");
  const prefixes =
    flagIndex === -1
      ? DEFAULT_PREFIXES
      : (argv[flagIndex + 1] ?? "")
          .split(",")
          .map((prefix) => prefix.trim())
          .filter(Boolean);
  const valueIndex = flagIndex === -1 ? -1 : flagIndex + 1;
  const positional = argv.filter((arg, index) => !arg.startsWith("--") && index !== valueIndex);
  return { branch: positional[0], prefixes };
}

function main(argv) {
  const { branch, prefixes } = parseArgs(argv);
  const violations = findViolations(branch ?? currentBranch(), prefixes);
  if (violations.length === 0) return 0;
  for (const message of violations) console.error(message);
  return 1;
}

if (isMain) process.exit(main(process.argv.slice(2)));
