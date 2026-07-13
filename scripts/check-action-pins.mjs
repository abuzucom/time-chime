#!/usr/bin/env node
/**
 * Validates that every third-party GitHub Action referenced from
 * .github/workflows/*.yml is pinned to a full commit SHA with a trailing
 * `# vX.Y.Z`-style comment, instead of a mutable tag (`@v4`) that can be
 * silently moved to point at different code.
 *
 * Usage:
 *   node scripts/check-action-pins.mjs         # check only, exits 1 on violations
 *   node scripts/check-action-pins.mjs --fix    # resolves + rewrites violations in place
 *
 * Intended for local/manual use (see package.json's check:action-pins) and
 * for .github/workflows/action-pin-autofix.yml in --fix mode.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKFLOWS_DIR = resolve(__dirname, "../.github/workflows");

// True when invoked directly (`node scripts/check-action-pins.mjs`), false
// when imported by a test. Guards the main() side-effects so the module is
// safe to `import`.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

// Matches a `uses:` step line and captures the leading indent/prefix, the
// action reference (`owner/repo[/subpath]@ref`), and any trailing comment.
const USES_LINE = /^(\s*(?:-\s+)?uses:\s*)(\S+)(.*)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const VERSION_COMMENT = /^\s*#\s*\S+/;

function listWorkflowFiles() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(WORKFLOWS_DIR, name));
}

// Parses a `uses:` value into { actionPath, ref } or null when the line
// doesn't reference a pinnable remote action (local composite actions and
// docker:// refs are exempt — there is no tag/SHA to pin for those).
function parseActionRef(value) {
  if (value.startsWith("./") || value.startsWith("docker://")) return null;
  const at = value.indexOf("@");
  if (at === -1) return null;
  return { actionPath: value.slice(0, at), ref: value.slice(at + 1) };
}

function findViolations(filePath) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const violations = [];
  lines.forEach((line, index) => {
    const match = line.match(USES_LINE);
    if (!match) return;
    const parsed = parseActionRef(match[2]);
    if (!parsed) return;
    const pinned = FULL_SHA.test(parsed.ref) && VERSION_COMMENT.test(match[3]);
    if (!pinned) {
      violations.push({ filePath, line: index + 1, value: match[2], ...parsed });
    }
  });
  return violations;
}

// Resolves `ref` (a tag or branch name) to the commit SHA it currently
// points at, for the GitHub repo backing `owner/repo[/subpath]`.
function resolveShaForRef(actionPath, ref) {
  const [owner, repo] = actionPath.split("/");
  const url = `https://github.com/${owner}/${repo}.git`;
  const output = execFileSync("git", ["ls-remote", "--tags", url, ref], {
    encoding: "utf8",
  }).trim();
  if (!output) return null;
  // Prefer the dereferenced commit (`^{}`) for annotated tags; otherwise
  // the lightweight tag already points straight at the commit.
  const rows = output.split("\n").map((row) => row.split("\t"));
  const dereferenced = rows.find(([, name]) => name.endsWith("^{}"));
  return (dereferenced ?? rows[0])[0];
}

function runCheck() {
  const violations = listWorkflowFiles().flatMap(findViolations);
  if (violations.length === 0) {
    console.log("all GitHub Actions references are pinned to commit SHAs");
    return 0;
  }
  console.error("unpinned GitHub Actions references found:");
  for (const v of violations) {
    console.error(`  ${v.filePath}:${v.line} - uses: ${v.value}`);
  }
  console.error("run: node scripts/check-action-pins.mjs --fix");
  return 1;
}

function runFix() {
  const files = listWorkflowFiles();
  let fixedCount = 0;
  let failedCount = 0;

  for (const filePath of files) {
    const violations = findViolations(filePath);
    if (violations.length === 0) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const v of violations) {
      let sha;
      try {
        sha = resolveShaForRef(v.actionPath, v.ref);
      } catch (err) {
        console.error(
          `error: could not resolve ${v.actionPath}@${v.ref} (${filePath}:${v.line}): ${err.message}`,
        );
        failedCount += 1;
        continue;
      }
      if (!sha) {
        console.error(`error: no tag "${v.ref}" found for ${v.actionPath} (${filePath}:${v.line})`);
        failedCount += 1;
        continue;
      }
      const match = lines[v.line - 1].match(USES_LINE);
      lines[v.line - 1] = `${match[1]}${v.actionPath}@${sha} # ${v.ref}`;
      console.log(`fixed ${filePath}:${v.line} - ${v.actionPath}@${v.ref} -> ${sha}`);
      fixedCount += 1;
    }
    writeFileSync(filePath, lines.join("\n"));
  }

  if (fixedCount === 0 && failedCount === 0) {
    console.log("all GitHub Actions references are already pinned to commit SHAs");
  }
  return failedCount > 0 ? 1 : 0;
}

if (isMain) {
  process.exit(process.argv.includes("--fix") ? runFix() : runCheck());
}
