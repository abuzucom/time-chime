#!/usr/bin/env node
// Sync AGENTS.md to tool-specific copies. --check verifies without writing.
import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE = "AGENTS.md";
const COPIES = ["CLAUDE.md", "GEMINI.md", "CONVENTIONS.md", ".cursorrules", ".clinerules", ".windsurfrules"];

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

function isInSync(sourcePath, copyPath) {
  return existsSync(copyPath) && readFileSync(sourcePath, "utf8") === readFileSync(copyPath, "utf8");
}

function syncCopies(checkOnly) {
  const sourcePath = path.join(root, SOURCE);
  if (!existsSync(sourcePath)) {
    console.error(`error: ${SOURCE} not found at ${root}`);
    return 1;
  }

  const stale = COPIES.filter((name) => !isInSync(sourcePath, path.join(root, name)));

  if (checkOnly) {
    if (stale.length > 0) {
      console.error(`out of sync with ${SOURCE}: ${stale.join(", ")}`);
      console.error("run: node scripts/sync-agent-docs.mjs");
      return 1;
    }
    console.log("all copies in sync");
    return 0;
  }

  for (const name of stale) {
    copyFileSync(sourcePath, path.join(root, name));
    console.log(`synced ${name}`);
  }
  if (stale.length === 0) {
    console.log("all copies already in sync");
  }
  return 0;
}

process.exit(syncCopies(process.argv.includes("--check")));
