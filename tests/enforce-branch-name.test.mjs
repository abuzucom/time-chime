// Unit tests for hooks/enforce-branch-name.mjs and scripts/check-branch-name.mjs.
//
// Run with:  node --test tests/enforce-branch-name.test.mjs
//
// The hook runs as a subprocess with a JSON payload on stdin, the same path
// Claude Code uses, so these tests exercise the real contract rather than an
// imported function. The settings-wiring group matters most over time: an
// unregistered hook enforces nothing while every behavioral test still passes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_PATH = resolve(REPO_ROOT, "hooks/enforce-branch-name.mjs");
const CHECKER_PATH = resolve(REPO_ROOT, "scripts/check-branch-name.mjs");
const LIVE_SETTINGS = resolve(REPO_ROOT, ".claude/settings.json");

const VIOLATING_BRANCH = "claude/session-start-hook-branch-check-5b33fv";
const CONFORMING_BRANCH = "chore/session-start-branch-check";
const BLOCKING_EXIT_CODE = 2;

// Runs the hook as the harness does: JSON on stdin, branch from the env.
// check-branch-name.mjs reads GITHUB_HEAD_REF before falling back to git, so
// the result never depends on which branch the test run happens to be on.
function runHook(payload, branch) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: payload === null ? "" : payload,
    encoding: "utf8",
    env: { ...process.env, GITHUB_HEAD_REF: branch, CLAUDE_PROJECT_DIR: REPO_ROOT },
  });
}

function runChecker(branch) {
  return spawnSync(process.execPath, [CHECKER_PATH, branch], { encoding: "utf8" });
}

function bashPayload(command) {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  });
}

const SESSION_START = JSON.stringify({
  hook_event_name: "SessionStart",
  source: "startup",
  cwd: REPO_ROOT,
});

// ---------------------------------------------------------------------------
// scripts/check-branch-name.mjs
// ---------------------------------------------------------------------------

test("checker: rejects a claude/ prefix", () => {
  const result = runChecker(VIOLATING_BRANCH);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match/);
});

test("checker: accepts every conforming prefix", () => {
  for (const branch of ["feat/a", "fix/a-b", "chore/a-b-c", "docs/a1", "test/a-1-b"]) {
    assert.equal(runChecker(branch).status, 0, `${branch} should be accepted`);
  }
});

test("checker: exempts main, master, and a detached HEAD", () => {
  for (const branch of ["main", "master", "HEAD"]) {
    assert.equal(runChecker(branch).status, 0, `${branch} should be exempt`);
  }
});

test("checker: rejects a conforming prefix with a non-kebab description", () => {
  assert.equal(runChecker("feat/Not_Kebab").status, 1);
});

// ---------------------------------------------------------------------------
// SessionStart
// ---------------------------------------------------------------------------

test("SessionStart: a violation injects context and still exits zero", () => {
  const result = runHook(SESSION_START, VIOLATING_BRANCH);
  assert.equal(result.status, 0, "Claude Code ignores a non-zero SessionStart exit");
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /STOP: BRANCH NAME VIOLATION/);
  assert.match(output.hookSpecificOutput.additionalContext, /git branch -m/);
  assert.match(output.systemMessage, /STOP: BRANCH NAME VIOLATION/);
});

test("SessionStart: a conforming branch stays silent", () => {
  const result = runHook(SESSION_START, CONFORMING_BRANCH);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("SessionStart: a missing event name defaults to SessionStart", () => {
  const result = runHook(JSON.stringify({ cwd: REPO_ROOT }), VIOLATING_BRANCH);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /STOP: BRANCH NAME VIOLATION/);
});

test("SessionStart: empty stdin exits zero", () => {
  assert.equal(runHook(null, CONFORMING_BRANCH).status, 0);
});

test("SessionStart: malformed stdin exits zero", () => {
  assert.equal(runHook("{not json", CONFORMING_BRANCH).status, 0);
});

// ---------------------------------------------------------------------------
// PreToolUse
// ---------------------------------------------------------------------------

test("PreToolUse: git commit on a violating branch is blocked", () => {
  const result = runHook(bashPayload("git commit -m 'x'"), VIOLATING_BRANCH);
  assert.equal(result.status, BLOCKING_EXIT_CODE);
  assert.match(result.stderr, /non-conforming branch/);
});

test("PreToolUse: git push on a violating branch is blocked", () => {
  const result = runHook(bashPayload("git push -u origin HEAD"), VIOLATING_BRANCH);
  assert.equal(result.status, BLOCKING_EXIT_CODE);
});

test("PreToolUse: a chained command containing git push is blocked", () => {
  const result = runHook(bashPayload("npm test && git push"), VIOLATING_BRANCH);
  assert.equal(result.status, BLOCKING_EXIT_CODE);
});

test("PreToolUse: commit and push are allowed on a conforming branch", () => {
  assert.equal(runHook(bashPayload("git commit -m 'x'"), CONFORMING_BRANCH).status, 0);
  assert.equal(runHook(bashPayload("git push"), CONFORMING_BRANCH).status, 0);
});

test("PreToolUse: the rename escape hatch is never blocked", () => {
  const result = runHook(bashPayload("git branch -m chore/renamed"), VIOLATING_BRANCH);
  assert.equal(result.status, 0, "the fix for the violation must not be blocked");
});

test("PreToolUse: read-only git commands are allowed on a violating branch", () => {
  for (const command of ["git status", "git log --oneline", "git diff"]) {
    assert.equal(runHook(bashPayload(command), VIOLATING_BRANCH).status, 0, command);
  }
});

test("PreToolUse: a non-git command is allowed on a violating branch", () => {
  assert.equal(runHook(bashPayload("bun run test"), VIOLATING_BRANCH).status, 0);
});

test("PreToolUse: a non-Bash tool is ignored", () => {
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: "x", content: "git commit" },
  });
  assert.equal(runHook(payload, VIOLATING_BRANCH).status, 0);
});

// ---------------------------------------------------------------------------
// Settings wiring
// ---------------------------------------------------------------------------

function registeredCommands(settings, event) {
  return (settings.hooks?.[event] ?? []).flatMap((matcher) =>
    (matcher.hooks ?? []).map((entry) => entry.command ?? ""),
  );
}

test("settings: .claude/settings.json registers the hook for both events", () => {
  const settings = JSON.parse(readFileSync(LIVE_SETTINGS, "utf8"));
  for (const event of ["SessionStart", "PreToolUse"]) {
    const commands = registeredCommands(settings, event);
    assert.ok(
      commands.some((command) => command.includes("enforce-branch-name.mjs")),
      `settings.json does not register the hook for ${event}`,
    );
  }
});

test("settings: every PreToolUse entry targets the Bash matcher", () => {
  const settings = JSON.parse(readFileSync(LIVE_SETTINGS, "utf8"));
  for (const matcher of settings.hooks.PreToolUse) {
    assert.equal(matcher.matcher, "Bash");
  }
});
