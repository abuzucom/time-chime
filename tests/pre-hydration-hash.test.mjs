/**
 * Contract test: the precomputed SHA-256 hash in `pre-hydration.ts` matches
 * the actual script bytes. If someone edits `PRE_HYDRATION_SCRIPT` without
 * regenerating the hash, the browser will refuse to execute the inline
 * script under the strict CSP (`script-src 'self' 'sha256-...'`) and the
 * theme flash-of-wrong-palette will return. Catch it here instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, "../src/lib/http/pre-hydration.ts"),
  "utf8",
);

function extract(name, src) {
  // Matches: export const NAME = `...`;   OR   export const NAME = "...";
  const backtick = new RegExp(
    `export const ${name} = \`([\\s\\S]*?)\`;`,
  ).exec(src);
  if (backtick) return backtick[1];
  const dquote = new RegExp(`export const ${name} = "([^"]*)";`).exec(src);
  if (dquote) return dquote[1];
  throw new Error(`could not extract ${name}`);
}

test("PRE_HYDRATION_SCRIPT_SHA256 matches PRE_HYDRATION_SCRIPT bytes", () => {
  const script = extract("PRE_HYDRATION_SCRIPT", source);
  const declared = extract("PRE_HYDRATION_SCRIPT_SHA256", source);
  const actual = createHash("sha256").update(script).digest("base64");
  assert.equal(
    declared,
    actual,
    `Hash drift! Update PRE_HYDRATION_SCRIPT_SHA256 to "${actual}".`,
  );
});
