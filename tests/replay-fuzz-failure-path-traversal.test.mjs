#!/usr/bin/env node
/**
 * Security test: Path traversal vulnerability mitigation in replay-fuzz-failure.mjs
 *
 * Verifies that the script properly rejects path traversal attempts when processing
 * explicit file paths provided by users. The mitigation validates input paths to
 * reject those containing '..' or absolute paths before resolving them.
 *
 * Coverage:
 * - Path traversal with ../ sequences (single and multiple)
 * - Absolute Unix paths
 * - Mixed path separators with traversal
 * - Valid relative paths (should be accepted)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(HERE, "..", "scripts", "replay-fuzz-failure.mjs");

/**
 * Helper to run the replay script with given arguments.
 * Returns { exitCode, stdout, stderr }
 */
function runScript(args) {
  return new Promise((resolve) => {
    const proc = spawn("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], {
      cwd: join(HERE, ".."),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Path Traversal Security Tests
// ---------------------------------------------------------------------------

test("rejects single-level path traversal (../)", async () => {
  const result = await runScript(["../etc/passwd"]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

test("rejects multi-level path traversal (../../)", async () => {
  const result = await runScript(["../../sensitive-file.json"]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

test("rejects embedded path traversal (tests/../../../etc/passwd)", async () => {
  const result = await runScript(["tests/../../../etc/passwd"]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

test("rejects absolute Unix path (/etc/passwd)", async () => {
  const result = await runScript(["/etc/passwd"]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

test("rejects path with trailing .. (tests/..)", async () => {
  const result = await runScript(["tests/.."]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

test("rejects when any argument contains path traversal", async () => {
  const result = await runScript([
    "tests/valid.json",
    "../../../etc/passwd",
    "tests/another.json"
  ]);
  
  assert.equal(result.exitCode, 2, "Should exit with error code 2 when any path is malicious");
  assert.match(result.stderr, /Invalid path/i, "Should report 'Invalid path' error");
});

// ---------------------------------------------------------------------------
// Valid Path Tests (should be accepted)
// ---------------------------------------------------------------------------

test("accepts valid relative path", async () => {
  const result = await runScript(["tests/__fuzz-failures__/nonexistent.json"]);
  
  const hasInvalidPathError = /Invalid path/i.test(result.stderr);
  assert.equal(hasInvalidPathError, false, "Valid relative path should not be rejected");
});

test("accepts simple filename", async () => {
  const result = await runScript(["failure.json"]);
  
  const hasInvalidPathError = /Invalid path/i.test(result.stderr);
  assert.equal(hasInvalidPathError, false, "Simple filename should not be rejected");
});

// ---------------------------------------------------------------------------
// Normal Operation Tests
// ---------------------------------------------------------------------------

test("help flag works normally", async () => {
  const result = await runScript(["--help"]);
  
  assert.equal(result.exitCode, 0, "Help should exit cleanly");
  assert.match(result.stdout, /Usage:/i, "Help should display usage information");
});

test("no arguments works normally", async () => {
  const result = await runScript([]);
  
  assert.equal(result.exitCode, 0, "No arguments should work normally");
  assert.doesNotMatch(result.stderr, /Invalid path/i, "Should not have path errors");
});

test("--latest flag works normally", async () => {
  const result = await runScript(["--latest"]);
  
  assert.equal(result.exitCode, 0, "Latest flag should work normally");
  assert.doesNotMatch(result.stderr, /Invalid path/i, "Should not have path errors");
});

