#!/usr/bin/env node
/**
 * Enforces AGENTS.md rule 11: every `actions/checkout` step sets
 * `persist-credentials: false` unless the job genuinely needs the credential
 * afterward. Leaving the default `true` writes the ephemeral `GITHUB_TOKEN`
 * into the runner's git config for the rest of the job, where any later step
 * or third-party action can read it.
 *
 * A checkout step passes when its own block contains
 * `persist-credentials: false`, or when the exact rule 11 exception comment
 * sits directly above the step:
 *
 *   # persist-credentials: true: this job <reason> (Rule 11 exception).
 *
 * Text and indent based rather than a YAML parse, to stay dependency-free
 * like its sibling checkers.
 *
 * Usage:
 *   node scripts/check-persist-credentials.mjs .github/workflows/*.yml
 *
 * Exits 1 on any violation. Ported from abuzucom/agents
 * scripts/check_persist_credentials.py (1.11.0).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CHECKOUT_USES = /uses:\s*actions\/checkout@/;
const PERSIST_FALSE = /persist-credentials:\s*false\b/;
const EXCEPTION_COMMENT = /#\s*persist-credentials:\s*true:.*\(Rule 11 exception\)\./;

// True when invoked directly, false when imported by a test. Guards the
// main() side-effects so the module is safe to `import`.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

/** Number of leading spaces on `line`. */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

// Index of the `- ` step marker owning the `uses:` line at `usesIndex`. A
// `- uses:` line is its own marker, so the walk usually stops immediately.
function stepStart(lines, usesIndex) {
  const usesIndent = indentOf(lines[usesIndex]);
  for (let index = usesIndex; index >= 0; index -= 1) {
    const stripped = lines[index].trimStart();
    if (stripped.startsWith("- ") && indentOf(lines[index]) <= usesIndent) return index;
  }
  return usesIndex;
}

// Lines belonging to the block introduced at `start`: everything up to the
// next non-blank line indented at or above the block's own level.
function blockLines(lines, start) {
  const indent = indentOf(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    if (indentOf(lines[index]) <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end);
}

// Comment and blank lines immediately above `start`, in original order. The
// rule 11 exception comment is written above the step, not inside it.
function leadingComments(lines, start) {
  const comments = [];
  for (let index = start - 1; index >= 0; index -= 1) {
    const stripped = lines[index].trim();
    if (!stripped.startsWith("#") && stripped) break;
    comments.push(lines[index]);
  }
  return comments.reverse();
}

/** One message per checkout step missing `persist-credentials: false`. */
export function findViolations(text, path) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, number) => {
    if (!CHECKOUT_USES.test(line)) return;
    const start = stepStart(lines, number);
    const block = [...leadingComments(lines, start), ...blockLines(lines, start)].join("\n");
    if (PERSIST_FALSE.test(block) || EXCEPTION_COMMENT.test(block)) return;
    violations.push(
      `${path}:${number + 1}: actions/checkout missing persist-credentials: false (Rule 11)`,
    );
  });
  return violations;
}

function main(paths) {
  if (paths.length === 0) {
    console.error("usage: node scripts/check-persist-credentials.mjs FILE [FILE ...]");
    return 1;
  }
  const violations = paths.flatMap((path) => findViolations(readFileSync(path, "utf8"), path));
  if (violations.length === 0) return 0;
  for (const message of violations) console.error(message);
  console.error("fix: add `with: persist-credentials: false`, or the Rule 11 exception comment");
  return 1;
}

if (isMain) process.exit(main(process.argv.slice(2)));
