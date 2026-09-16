#!/usr/bin/env node
// Node port of scripts/trusted_gh.py: resolve GitHub CLI outside the
// repository, verify the authenticated account, and run bounded commands.
// Gated shell hooks recognize only the Python wrapper; this port covers
// contexts without Python. Behavior mirrors the Python wrapper.

import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ACCOUNT_OUTPUT_LIMIT = 256;
const COMMAND_OUTPUT_LIMIT = 1024 * 1024;
const METADATA_OUTPUT_LIMIT = 65536;
const GH_TIMEOUT_MS = 5000;
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const TEXT_OPTIONS = new Set(["--body", "--title"]);
const REPOSITORY_COMMANDS = new Set(["pr", "issue", "run"]);
const GLOBAL_VALUE_OPTIONS = new Set(["-R", "--repo", "--hostname"]);
const PROXY_VARIABLES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];
const MANAGED_PROXY_HOST = "127.0.0.1";
const MANAGED_PROXY_PORT = 9;
const MAX_GIT_WALK = 100;

class InputError extends Error {}
class NotFound extends Error {}
class RuntimeFault extends Error {}

function findLiteralEscapeSequences(args) {
  const findings = [];
  for (const [index, argument] of args.slice(0, -1).entries()) {
    if (TEXT_OPTIONS.has(argument) && args[index + 1].includes("\\n")) {
      findings.push(argument);
    }
  }
  return findings;
}

function readBounded(file) {
  if (statSync(file).size > METADATA_OUTPUT_LIMIT) {
    throw new InputError(`metadata exceeds the safety limit: ${file}`);
  }
  return readFileSync(file, "utf8");
}

function findGitEntry(start) {
  let current = path.resolve(start);
  for (let hops = 0; hops < MAX_GIT_WALK; hops += 1) {
    const candidate = path.join(current, ".git");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new NotFound("repository context is missing; run from a Git checkout");
}

function resolveWorktreeDir(gitEntry) {
  const content = readBounded(gitEntry).trim();
  const separatorAt = content.indexOf(":");
  const marker = separatorAt === -1 ? "" : content.slice(0, separatorAt).trim().toLowerCase();
  const value = separatorAt === -1 ? "" : content.slice(separatorAt + 1).trim();
  if (marker !== "gitdir" || value === "") {
    throw new InputError("repository context has an invalid Git worktree pointer");
  }
  const gitDir = path.resolve(path.dirname(gitEntry), value);
  if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) {
    throw new NotFound("repository context has a missing Git worktree directory");
  }
  return gitDir;
}

function commonConfigDir(gitDir) {
  const commonFile = path.join(gitDir, "commondir");
  if (!existsSync(commonFile)) {
    return gitDir;
  }
  const common = readBounded(commonFile).trim();
  if (common === "" || common.includes("\n") || common.includes("\r")) {
    throw new InputError("repository context has an invalid common Git directory");
  }
  const resolved = path.resolve(gitDir, common);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new NotFound("repository context has a missing common Git directory");
  }
  return resolved;
}

function gitConfigDir(start) {
  const entry = findGitEntry(start);
  if (statSync(entry).isDirectory()) {
    return entry;
  }
  return commonConfigDir(resolveWorktreeDir(entry));
}

function gitAdministrativeDir(start) {
  const entry = findGitEntry(start);
  if (statSync(entry).isDirectory()) {
    return entry;
  }
  return resolveWorktreeDir(entry);
}

function originUrl(configDir) {
  const configPath = path.join(configDir, "config");
  let section = "";
  let origin = "";
  for (const rawLine of readBounded(configPath).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.toLowerCase();
      continue;
    }
    const separatorAt = line.indexOf("=");
    if (separatorAt === -1) {
      continue;
    }
    const key = line.slice(0, separatorAt).trim().toLowerCase();
    if (section === '[remote "origin"]' && key === "url") {
      origin = line.slice(separatorAt + 1).trim();
    }
  }
  if (origin === "") {
    throw new InputError("repository context has no origin remote");
  }
  return origin;
}

function repositoryFromOrigin(origin) {
  if (/[\r\n	]/.test(origin)) {
    throw new InputError("repository context contains unsafe origin metadata");
  }
  const value = origin.trim();
  let pathPart = "";
  if (value.startsWith("https://") || value.startsWith("ssh://")) {
    const parsed = new URL(value);
    if (
      parsed.hostname !== "github.com" ||
      parsed.password ||
      !["", "git"].includes(parsed.username)
    ) {
      throw new InputError("repository origin is not a safe GitHub remote");
    }
    pathPart = parsed.pathname.replace(/^\//, "");
  } else if (value.startsWith("git@github.com:")) {
    pathPart = value.slice("git@github.com:".length);
  } else {
    throw new InputError("repository origin is not a supported GitHub remote");
  }
  const parts = pathPart.replace(/\.git$/, "").split("/");
  if (parts.length !== 2 || parts.some((part) => !REPOSITORY_NAME.test(part))) {
    throw new InputError("repository origin has an invalid owner or repository");
  }
  return parts.join("/");
}

function repositoryTarget(start) {
  return repositoryFromOrigin(originUrl(gitConfigDir(start)));
}

function repositoryBranch(start) {
  const headPath = path.join(gitAdministrativeDir(start), "HEAD");
  const marker = "ref: refs/heads/";
  const content = readBounded(headPath).trim();
  if (!content.startsWith(marker)) {
    throw new InputError("repository has no named branch; check out a branch first");
  }
  const branch = content.slice(marker.length);
  const illegalComponent = branch.split("/").some((part) => ["", ".", ".."].includes(part));
  if (!BRANCH_NAME.test(branch) || illegalComponent) {
    throw new InputError("repository has an invalid current branch");
  }
  return branch;
}

function hasRepositoryOption(args) {
  for (const [index, argument] of args.entries()) {
    if (["-R", "--repo"].includes(argument) && index + 1 < args.length) {
      return true;
    }
    if (argument.startsWith("--repo=") || (argument.startsWith("-R") && argument.length > 2)) {
      return true;
    }
  }
  return false;
}

function commandPosition(args) {
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (argument === "--") {
      return index + 1;
    }
    if (GLOBAL_VALUE_OPTIONS.has(argument)) {
      index += 2;
    } else if (argument.startsWith("--") && argument.includes("=")) {
      index += 1;
    } else if (argument.startsWith("-")) {
      index += 1;
    } else {
      return index;
    }
  }
  return args.length;
}

function headArgument(target, branch) {
  return ["--head", `${target.split("/")[0]}:${branch}`];
}

function withRepositoryContext(repository, args) {
  const position = commandPosition(args);
  if (
    position >= args.length ||
    !REPOSITORY_COMMANDS.has(args[position]) ||
    hasRepositoryOption(args)
  ) {
    return [...args];
  }
  const target = repositoryTarget(repository);
  const delimiter = args.indexOf("--") === -1 ? args.length : args.indexOf("--");
  const context = [...args.slice(0, delimiter), "--repo", target, ...args.slice(delimiter)];
  const isCreate = args.slice(position, position + 2).join(" ") === "pr create";
  const hasHead = args.some((argument) => argument === "--head" || argument.startsWith("--head="));
  if (isCreate && !hasHead) {
    context.splice(delimiter, 0, ...headArgument(target, repositoryBranch(repository)));
  }
  return context;
}

function isInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function candidateOutsideRepository(directory, names, repository) {
  for (const name of names) {
    const candidate = path.join(directory, name);
    if (isInside(path.resolve(candidate), repository) || !existsSync(candidate)) {
      continue;
    }
    if (lstatSync(candidate).isSymbolicLink() || !statSync(candidate).isFile()) {
      continue;
    }
    if (process.platform !== "win32") {
      try {
        accessSync(candidate, constants.X_OK);
      } catch {
        continue;
      }
    }
    return path.resolve(candidate);
  }
  return "";
}

function resolveGh(repoRoot) {
  const repository = path.resolve(repoRoot);
  const names = process.platform === "win32" ? ["gh.exe", "gh.com"] : ["gh"];
  for (const rawDirectory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!rawDirectory || !path.isAbsolute(rawDirectory.replaceAll('"', ""))) {
      continue;
    }
    const candidate = candidateOutsideRepository(
      rawDirectory.replaceAll('"', ""),
      names,
      repository,
    );
    if (candidate) {
      return candidate;
    }
  }
  throw new NotFound("trusted GitHub CLI executable was not found on PATH");
}

function safeSearchPath(repository) {
  const entries = [];
  for (const rawDirectory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!rawDirectory) {
      continue;
    }
    const cleaned = rawDirectory.replaceAll('"', "");
    if (!path.isAbsolute(cleaned) || isInside(path.resolve(cleaned), repository)) {
      continue;
    }
    entries.push(cleaned);
  }
  return entries.join(path.delimiter);
}

function managedProxyValue(value) {
  try {
    const text = value.includes("://") ? value : `//${value}`;
    const parsed = new URL(text, "http://placeholder.invalid");
    return parsed.hostname === MANAGED_PROXY_HOST && Number(parsed.port) === MANAGED_PROXY_PORT;
  } catch {
    return false;
  }
}

function buildEnvironment(repository, executable) {
  const environment = { ...process.env };
  delete environment.GH_CONFIG_DIR;
  delete environment.GH_REPO;
  for (const variable of PROXY_VARIABLES) {
    if (environment[variable] && managedProxyValue(environment[variable])) {
      delete environment[variable];
    }
  }
  environment.GH_PAGER = "";
  environment.GH_PROMPT_DISABLED = "1";
  environment.PATH = safeSearchPath(repository);
  if (process.platform === "win32") {
    environment.NoDefaultCurrentDirectoryInExePath = "1";
  }
  return environment;
}

function runGh(repoRoot, args, timeoutMs) {
  const repository = path.resolve(repoRoot);
  const executable = resolveGh(repository);
  const result = spawnSync(executable, args, {
    cwd: tmpdir(),
    env: buildEnvironment(repository, executable),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: COMMAND_OUTPUT_LIMIT * 2,
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    throw new RuntimeFault("GitHub CLI timed out; verify connectivity and retry");
  }
  if (result.error) {
    throw new RuntimeFault(result.error.message);
  }
  return result;
}

function parseAccount(output) {
  if (output.length > ACCOUNT_OUTPUT_LIMIT) {
    throw new InputError("GitHub account output exceeds the bound");
  }
  const fields = output.trim().split("\t");
  if (fields.length !== 2 || !/^\d+$/.test(fields[0]) || Number(fields[0]) < 1) {
    throw new InputError("GitHub account output has an invalid account ID");
  }
  if (!LOGIN_PATTERN.test(fields[1])) {
    throw new InputError("GitHub account output has an invalid login");
  }
  return { id: Number(fields[0]), login: fields[1] };
}

function authenticatedAccount(repoRoot) {
  return parseAccount(
    runGh(repoRoot, ["api", "user", "--jq", "[.id,.login]|@tsv"], GH_TIMEOUT_MS).stdout,
  );
}

const verdictCache = new Map();

function loadVerdicts(root) {
  const denylist = path.join(root, "hooks", "github-command-denylist.txt");
  const key = `${root}:${statSync(denylist).mtimeMs}`;
  if (verdictCache.has(key)) {
    return verdictCache.get(key);
  }
  verdictCache.clear();
  const families = new Set();
  const paths = new Set();
  for (const rawLine of readFileSync(denylist, "utf8").split(/\r?\n/)) {
    const tokens = rawLine.trim().split(/\s+/);
    if (tokens[0] === "family" && tokens[1]) {
      families.add(tokens[1]);
    }
    if (tokens[0] === "path" && tokens[1] && tokens[2]) {
      paths.add(`${tokens[1]} ${tokens[2]}`);
    }
  }
  const verdicts = { families, paths };
  verdictCache.set(key, verdicts);
  return verdicts;
}

const SAFE_API_METHODS = new Set(["GET", "HEAD"]);

function unsafeApiMethod(args) {
  const position = commandPosition(args);
  if (args[position] !== "api") {
    return false;
  }
  for (const [index, argument] of args.entries()) {
    if (argument === "--method" && index + 1 < args.length) {
      return !SAFE_API_METHODS.has(args[index + 1].toUpperCase());
    }
    if (argument.startsWith("--method=")) {
      return !SAFE_API_METHODS.has(argument.slice("--method=".length).toUpperCase());
    }
  }
  return false;
}

function forgeVerdict(args, root) {
  const position = commandPosition(args);
  const tokens = args.slice(position).filter((token) => !token.startsWith("-"));
  if (tokens.length === 0) {
    return "allow";
  }
  if (unsafeApiMethod(args)) {
    return "deny";
  }
  const { families, paths } = loadVerdicts(root);
  if (families.has(tokens[0]) || paths.has(tokens.slice(0, 2).join(" "))) {
    return "deny";
  }
  return "allow";
}

function mapFault(error) {
  if (error instanceof InputError) {
    return ["error: GitHub CLI input or repository metadata is invalid; inspect and retry", 1];
  }
  if (error instanceof NotFound) {
    return ["error: GitHub CLI or repository metadata is unavailable; inspect installation", 1];
  }
  return ["error: GitHub CLI execution failed; inspect connectivity and repository context", 1];
}

function runRequested(root, args) {
  if (args.length === 0) {
    process.stderr.write("error: run requires GitHub CLI arguments\n");
    return 2;
  }
  if (findLiteralEscapeSequences(args).length > 0) {
    process.stderr.write(
      "error: an argument contains literal escape text; use real newlines or --body-file\n",
    );
    return 2;
  }
  if (forgeVerdict(args, root) === "deny") {
    process.stderr.write("error: GitHub command denied by policy; review the command\n");
    return 2;
  }
  let result;
  try {
    const effective = withRepositoryContext(root, args);
    if (forgeVerdict(effective, root) === "deny") {
      process.stderr.write("error: GitHub command denied by policy; review the command\n");
      return 2;
    }
    authenticatedAccount(root);
    result = runGh(root, effective);
  } catch (error) {
    const [message, code] = mapFault(error);
    process.stderr.write(`${message}\n`);
    return code;
  }
  if (result.status === null) {
    process.stderr.write(
      "error: GitHub CLI execution failed; inspect connectivity and repository context\n",
    );
    return 1;
  }
  process.stdout.write((result.stdout ?? "").slice(0, COMMAND_OUTPUT_LIMIT));
  process.stderr.write((result.stderr ?? "").slice(0, COMMAND_OUTPUT_LIMIT));
  return result.status;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args[0] !== "run") {
      process.stderr.write("error: expected 'run' or no arguments\n");
      return 2;
    }
    return runRequested(process.cwd(), args.slice(1));
  }
  try {
    process.stdout.write(`${JSON.stringify(authenticatedAccount(process.cwd()))}\n`);
    return 0;
  } catch (error) {
    const [message, code] = mapFault(error);
    process.stderr.write(`${message}\n`);
    return code;
  }
}

export {
  authenticatedAccount,
  commandPosition,
  findLiteralEscapeSequences,
  forgeVerdict,
  hasRepositoryOption,
  parseAccount,
  repositoryBranch,
  repositoryFromOrigin,
  withRepositoryContext,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main());
}
