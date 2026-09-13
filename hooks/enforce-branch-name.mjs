#!/usr/bin/env node
/**
 * Enforces the branch-naming convention through Claude Code hooks.
 *
 * Not part of AGENTS.md, which stays tool-agnostic and is synced byte-identical
 * to non-Claude tools. This is a Claude-Code-specific hook, wired through
 * .claude/settings.json. One file serves two events, dispatched on
 * `hook_event_name` in the stdin payload:
 *
 * `SessionStart` runs scripts/check-branch-name.mjs before the session does any
 * git work and, on a violation, injects a stop-and-rename instruction into the
 * session context. Claude Code ignores a non-zero exit from a SessionStart
 * hook, so injected context is the only lever that event has.
 *
 * `PreToolUse` on the `Bash` matcher is the blocking half: it exits 2 on a
 * `git commit` or `git push` while the branch name is non-conforming, so a
 * session that reads the warning and proceeds anyway still cannot land the
 * branch.
 *
 * Together they cover a harness-assigned branch name, which the model does not
 * choose and, being stateless across sessions, cannot remember to fix. Renaming
 * the branch (`git branch -m <type>/<kebab-description>`) clears both, and the
 * rename command itself is never blocked.
 *
 * Ported from abuzucom/agents hooks/enforce_branch_name.py (1.11.0).
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const CHECKER_PATH = join("scripts", "check-branch-name.mjs");
const ALLOWED_PREFIXES = "feat/, fix/, chore/, docs/, test/";
const BLOCKING_EXIT_CODE = 2;
const BLOCKED_COMMANDS = [
  [/\bgit\s+commit\b/, "git commit"],
  [/\bgit\s+push\b/, "git push"],
];

/** The hook's stdin JSON, or an empty object when stdin carries none. */
function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // Empty or malformed stdin is not an error: the hook has nothing to act
    // on and must not break the session over it.
    return {};
  }
}

/** The repository root, preferring Claude Code's own variable. */
function projectDir(payload) {
  return process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
}

// The checker's complaint about the current branch, or an empty string. An
// absent checker yields an empty string: a repo that has not copied
// check-branch-name.mjs has no convention for this hook to enforce.
function findViolation(root) {
  const checker = join(root, CHECKER_PATH);
  if (!existsSync(checker)) return "";
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
  if (result.status === 0) return "";
  return result.stderr.trim() || "branch name does not match the convention";
}

/** The session-context text for a non-conforming branch. */
function buildWarning(violation) {
  return [
    "STOP: BRANCH NAME VIOLATION. DO NOT COMMIT, PUSH, OR OPEN A PR YET.",
    "",
    violation,
    "",
    "AGENTS.md bans this branch name, and CI runs",
    "scripts/check-branch-name.mjs on every pull request. A branch name",
    "assigned by the harness or a task description is not an exception:",
    "the rule takes precedence, and a PR opened from this branch fails.",
    "",
    "Take one of these two actions before any commit or push:",
    `1. Rename the branch to match <type>/<kebab-description> (${ALLOWED_PREFIXES}):`,
    "   git branch -m <type>/<kebab-description>",
    "2. Ask the user for explicit sign-off to keep the current name.",
    "",
    "A PreToolUse hook blocks git commit and git push until the name",
    "conforms, so proceeding without one of those two actions fails.",
  ].join("\n");
}

/** The git write operation found in `command`, or an empty string. */
export function blockedCommand(command) {
  for (const [pattern, label] of BLOCKED_COMMANDS) {
    if (pattern.test(command)) return label;
  }
  return "";
}

function handleSessionStart(root) {
  const violation = findViolation(root);
  if (!violation) return 0;
  const warning = buildWarning(violation);
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: warning },
      systemMessage: warning,
    }),
  );
  return 0;
}

function handlePreToolUse(payload, root) {
  if (payload.tool_name !== "Bash") return 0;
  const label = blockedCommand(payload.tool_input?.command ?? "");
  if (!label) return 0;
  const violation = findViolation(root);
  if (!violation) return 0;
  console.error(
    `blocked by hooks/enforce-branch-name.mjs: ${label} on a non-conforming branch.\n` +
      `${violation}\n` +
      `Rename the branch first (git branch -m <type>/<kebab-description>, one of ` +
      `${ALLOWED_PREFIXES}), or get the user's explicit sign-off to keep this name.`,
  );
  return BLOCKING_EXIT_CODE;
}

function main() {
  const payload = readPayload();
  const root = projectDir(payload);
  if (payload.hook_event_name === "PreToolUse") return handlePreToolUse(payload, root);
  return handleSessionStart(root);
}

process.exit(main());
