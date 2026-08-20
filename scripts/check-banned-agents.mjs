#!/usr/bin/env node
/**
 * Flags banned-agent authorship on the commits in a pull request range,
 * backing the Banned agents section of AGENTS.md.
 *
 * Matches commit author, committer, and `Co-authored-by` trailer name and
 * email, plus the pull request author's GitHub login, against a denylist.
 * Never scans free-form commit-message body or PR description text: "grok" is
 * an ordinary English verb and would false-positive constantly there.
 *
 * Limitation: a banned agent committing under a human's own git identity, with
 * no `Co-authored-by` trailer, is invisible to this check. No mechanical check
 * can close that gap; pair it with platform-level bot blocks.
 *
 * Usage:
 *   node scripts/check-banned-agents.mjs --base origin/main --head HEAD
 *
 * Exits 1 on a match. Ported from abuzucom/agents
 * scripts/check_banned_agents.py (1.11.0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DENYLIST_NAMES = ["grok", "xai"];
const DENYLIST_EMAIL_DOMAINS = new Set(["x.ai"]);
const TRAILER = /^Co-authored-by:\s*([^<]*)<([^>]+)>/gim;
const COMMIT_SEP = "\x1e";
const FIELD_SEP = "\x1f";
const SHA_LENGTH = 12;
const FIELD_COUNT = 6;
// git log output for a whole PR range can exceed execFileSync's 1 MB default.
const MAX_GIT_LOG_BYTES = 32 * 1024 * 1024;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

// True when a structured author/email field names a banned agent. Word
// boundaries keep "grokking" and similar ordinary words from matching.
function matchesDenylist(name, email) {
  const nameLower = name.trim().toLowerCase();
  const emailLower = email.trim().toLowerCase();
  const localPart = emailLower.split("@", 1)[0];
  for (const term of DENYLIST_NAMES) {
    const pattern = new RegExp(`\\b${term}\\b`);
    if (pattern.test(nameLower) || pattern.test(localPart)) return true;
  }
  const domain = emailLower.includes("@") ? emailLower.split("@").pop() : "";
  return DENYLIST_EMAIL_DOMAINS.has(domain);
}

function trailerViolations(sha, body) {
  const violations = [];
  for (const [, name, email] of body.matchAll(TRAILER)) {
    if (matchesDenylist(name.trim(), email)) {
      violations.push(`${sha}: banned-agent co-author '${name.trim()} <${email}>'`);
    }
  }
  return violations;
}

/** One message per banned-agent authorship signal found. */
export function findViolations(commits, prAuthor = "") {
  const violations = [];
  for (const entry of commits) {
    const sha = entry.sha.slice(0, SHA_LENGTH);
    for (const role of ["author", "committer"]) {
      const name = entry[`${role}Name`];
      const email = entry[`${role}Email`];
      if (matchesDenylist(name, email)) {
        violations.push(`${sha}: banned-agent ${role} '${name} <${email}>'`);
      }
    }
    violations.push(...trailerViolations(sha, entry.body ?? ""));
  }
  if (prAuthor && matchesDenylist(prAuthor, "")) {
    violations.push(`PR author: banned-agent login '${prAuthor}'`);
  }
  return violations;
}

/** Commit metadata for the `base..head` range, via git log. */
export function loadCommits(base, head) {
  const format = ["%H", "%an", "%ae", "%cn", "%ce", "%B"].join(FIELD_SEP);
  const stdout = execFileSync(
    "git",
    ["log", `${base}..${head}`, `--format=${format}${COMMIT_SEP}`],
    {
      encoding: "utf8",
      maxBuffer: MAX_GIT_LOG_BYTES,
    },
  );
  return stdout
    .split(COMMIT_SEP)
    .map((record) => record.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean)
    .map((record) => {
      const parts = record.split(FIELD_SEP);
      const [sha, authorName, authorEmail, committerName, committerEmail] = parts;
      return {
        sha,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        body: parts.slice(FIELD_COUNT - 1).join(FIELD_SEP),
      };
    });
}

// The PR author's GitHub login from the workflow event payload, when running
// in Actions. Empty outside CI, which simply skips the login check.
function prAuthorFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return "";
  try {
    return JSON.parse(readFileSync(eventPath, "utf8")).pull_request?.user?.login ?? "";
  } catch {
    return "";
  }
}

function parseRef(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? "" : (argv[index + 1] ?? "");
}

function main(argv) {
  const base = parseRef(argv, "--base");
  const head = parseRef(argv, "--head");
  if (!base || !head) {
    console.error("usage: node scripts/check-banned-agents.mjs --base REF --head REF");
    return 1;
  }
  const violations = findViolations(loadCommits(base, head), prAuthorFromEvent());
  if (violations.length === 0) {
    console.log("no banned-agent authorship found");
    return 0;
  }
  for (const message of violations) console.error(message);
  console.error("banned agents must not read, edit, commit, or open PRs here");
  return 1;
}

if (isMain) process.exit(main(process.argv.slice(2)));
