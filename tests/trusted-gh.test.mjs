// Behavioral tests for scripts/trusted-gh.mjs. No live GitHub CLI needed:
// every case exercises exported helpers or the CLI with a denied command or
// an empty PATH, which fails closed before any gh invocation.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  commandPosition,
  findLiteralEscapeSequences,
  forgeVerdict,
  hasRepositoryOption,
  parseAccount,
  repositoryBranch,
  repositoryFromOrigin,
  withRepositoryContext,
} from "../scripts/trusted-gh.mjs";

const REPOSITORY_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "trusted-gh.mjs");

describe("parseAccount", () => {
  test("parses a bounded TSV account", () => {
    assert.deepEqual(parseAccount("1234567\toctocat\n"), { id: 1234567, login: "octocat" });
  });

  test("rejects output above the bound", () => {
    assert.throws(() => parseAccount(`${"1".repeat(300)}\n`), /exceeds the bound/);
  });

  test("rejects non-numeric and zero IDs", () => {
    assert.throws(() => parseAccount("abc\toctocat"), /invalid account ID/);
    assert.throws(() => parseAccount("0\toctocat"), /invalid account ID/);
  });

  test("rejects invalid logins", () => {
    assert.throws(() => parseAccount("5\t-octocat"), /invalid login/);
    assert.throws(() => parseAccount("5\tocto cat"), /invalid login/);
    assert.throws(() => parseAccount("5\toctocat-"), /invalid login/);
  });

  test("tolerates stray carriage returns like the Python wrapper", () => {
    assert.deepEqual(parseAccount("5\toctocat\r"), { id: 5, login: "octocat" });
  });
});

describe("repositoryFromOrigin", () => {
  test("accepts the supported GitHub remote forms", () => {
    assert.equal(repositoryFromOrigin("https://github.com/owner/repository"), "owner/repository");
    assert.equal(
      repositoryFromOrigin("https://github.com/owner/repository.git"),
      "owner/repository",
    );
    assert.equal(
      repositoryFromOrigin("ssh://git@github.com/owner/repository.git"),
      "owner/repository",
    );
    assert.equal(repositoryFromOrigin("git@github.com:owner/repository.git"), "owner/repository");
  });

  test("rejects non-GitHub and unsafe remotes", () => {
    assert.throws(() => repositoryFromOrigin("https://example.com/owner/repository"), /not a safe/);
    assert.throws(
      () => repositoryFromOrigin("https://attacker-github.com/owner/repository"),
      /not a safe/,
    );
    assert.throws(
      () => repositoryFromOrigin("https://user@github.com/owner/repository"),
      /not a safe/,
    );
    assert.throws(
      () => repositoryFromOrigin("https://git:pass@github.com/owner/repository"),
      /not a safe/,
    );
    assert.throws(
      () => repositoryFromOrigin("ftp://github.com/owner/repository"),
      /not a supported/,
    );
  });

  test("rejects malformed owner or repository parts", () => {
    assert.throws(
      () => repositoryFromOrigin("https://github.com/owner"),
      /invalid owner or repository/,
    );
    assert.throws(
      () => repositoryFromOrigin("https://github.com/owner/rep/nested"),
      /invalid owner or repository/,
    );
    assert.throws(
      () => repositoryFromOrigin("git@github.com:owner/repository\r"),
      /unsafe origin metadata/,
    );
  });
});

describe("findLiteralEscapeSequences", () => {
  test("flags literal escape text in prose options", () => {
    assert.deepEqual(findLiteralEscapeSequences(["pr", "create", "--body", "one\\ntwo"]), [
      "--body",
    ]);
    assert.deepEqual(findLiteralEscapeSequences(["pr", "create", "--title", "x\\ny"]), ["--title"]);
  });

  test("accepts real newlines and other options", () => {
    assert.deepEqual(findLiteralEscapeSequences(["pr", "create", "--body", "one\ntwo"]), []);
    assert.deepEqual(findLiteralEscapeSequences(["pr", "view", "1", "--json", "title"]), []);
  });
});

describe("commandPosition", () => {
  test("skips global options and attached values", () => {
    assert.equal(commandPosition(["--repo", "owner/rep", "pr", "view", "1"]), 2);
    assert.equal(commandPosition(["--repo=owner/rep", "pr", "view"]), 1);
    assert.equal(commandPosition(["pr", "view", "1"]), 0);
  });

  test("honors the option terminator", () => {
    assert.equal(commandPosition(["--repo", "owner/rep", "--", "pr"]), 3);
  });
});

describe("hasRepositoryOption", () => {
  test("detects separate and attached forms", () => {
    assert.equal(hasRepositoryOption(["pr", "view", "-R", "owner/rep"]), true);
    assert.equal(hasRepositoryOption(["pr", "view", "--repo=owner/rep"]), true);
    assert.equal(hasRepositoryOption(["pr", "view", "-Rowner/rep"]), true);
    assert.equal(hasRepositoryOption(["pr", "view", "1"]), false);
    assert.equal(hasRepositoryOption(["pr", "view", "-R"]), false);
  });
});

function makeCheckout(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "trusted-gh-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, ".git"));
  writeFileSync(
    path.join(directory, ".git", "config"),
    '[remote "origin"]\n\turl = https://github.com/Owner/repository.git\n',
  );
  writeFileSync(path.join(directory, ".git", "HEAD"), "ref: refs/heads/feat/example\n");
  return directory;
}

describe("withRepositoryContext", () => {
  test("injects a validated --repo target", (t) => {
    const directory = makeCheckout(t);
    const context = withRepositoryContext(directory, ["pr", "view", "1"]);
    assert.deepEqual(context.slice(0, 4), ["pr", "view", "1", "--repo"]);
    assert.equal(context[4], "Owner/repository");
  });

  test("leaves explicit repository options untouched", (t) => {
    const directory = makeCheckout(t);
    const context = withRepositoryContext(directory, ["pr", "view", "1", "--repo", "other/rep"]);
    assert.deepEqual(context, ["pr", "view", "1", "--repo", "other/rep"]);
  });

  test("keeps non-repository commands untouched", (t) => {
    const directory = makeCheckout(t);
    const context = withRepositoryContext(directory, ["api", "user"]);
    assert.deepEqual(context, ["api", "user"]);
  });

  test("adds --head for pr create without a head option", (t) => {
    const directory = makeCheckout(t);
    const context = withRepositoryContext(directory, ["pr", "create", "--title", "Title"]);
    assert.deepEqual(context, [
      "pr",
      "create",
      "--title",
      "Title",
      "--head",
      "Owner:feat/example",
      "--repo",
      "Owner/repository",
    ]);
  });

  test("inserts context before the option terminator", (t) => {
    const directory = makeCheckout(t);
    const context = withRepositoryContext(directory, ["issue", "list", "--", "tail"]);
    const terminator = context.indexOf("--");
    assert.ok(terminator > 0);
    assert.equal(context.slice(terminator - 2, terminator).join(" "), "--repo Owner/repository");
  });
});

describe("repositoryBranch", () => {
  test("reads a valid named branch", (t) => {
    const directory = makeCheckout(t);
    assert.equal(repositoryBranch(directory), "feat/example");
  });

  test("rejects a detached HEAD", (t) => {
    const directory = makeCheckout(t);
    writeFileSync(path.join(directory, ".git", "HEAD"), "deadbeef\n");
    assert.throws(() => repositoryBranch(directory), /no named branch/);
  });
});

describe("forgeVerdict", () => {
  const root = REPOSITORY_ROOT;

  test("denies denylist families and descendants", () => {
    assert.equal(forgeVerdict(["repo", "clone", "owner/rep"], root), "deny");
    assert.equal(forgeVerdict(["release", "create", "v1.0.0"], root), "deny");
    assert.equal(forgeVerdict(["pr", "merge", "1"], root), "deny");
    assert.equal(forgeVerdict(["auth", "token"], root), "deny");
  });

  test("denies unsafe api methods in separate and attached forms", () => {
    assert.equal(forgeVerdict(["api", "--method", "DELETE", "repos/owner/rep"], root), "deny");
    assert.equal(forgeVerdict(["api", "--method=PATCH", "repos/owner/rep"], root), "deny");
    assert.equal(forgeVerdict(["api", "--method", "GET", "repos/owner/rep"], root), "allow");
  });

  test("allows read-only commands past global options", () => {
    assert.equal(forgeVerdict(["pr", "view", "1"], root), "allow");
    assert.equal(forgeVerdict(["--repo", "owner/rep", "issue", "list"], root), "allow");
  });
});

describe("CLI", () => {
  function runCli(args, env = {}) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
  }

  test("exit 2 when run carries no arguments", () => {
    const result = runCli(["run"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires GitHub CLI arguments/);
  });

  test("exit 2 for a denied command without resolving gh", () => {
    const result = runCli(["run", "repo", "delete", "owner/rep"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /denied by policy/);
  });

  test("exit 2 for literal escape text", () => {
    const result = runCli(["run", "pr", "create", "--title", "a\\nb"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /literal escape text/);
  });

  test("exit 2 for a rejected subcommand name", () => {
    const result = runCli(["inspect", "pr"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /expected 'run'/);
  });

  test("exit 1 with an empty PATH", () => {
    const result = runCli(["run", "pr", "list"], { PATH: "K:\\" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unavailable; inspect installation/);
  });
});
