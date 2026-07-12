#!/usr/bin/env node
/**
 * Rewrite the <!-- ZAP-BASELINE:START/END --> block in docs/COMPLIANCE.md
 * with a summary of the latest OWASP ZAP baseline scan.
 *
 * Inputs (env or argv):
 *   TARGET_URL   — URL that was scanned
 *   REPORT_JSON  — path to zap_baseline JSON report (report_json.json)
 *   RUN_URL      — link to the CI run (optional)
 *   SCAN_DATE    — ISO date string (defaults to now)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(__dirname, "../docs/COMPLIANCE.md");
const START = "<!-- ZAP-BASELINE:START -->";
const END = "<!-- ZAP-BASELINE:END -->";

const target = process.env.TARGET_URL ?? "unknown";
const reportPath = process.env.REPORT_JSON ?? "zap-report.json";
const runUrl = process.env.RUN_URL ?? "";
const scanDate = process.env.SCAN_DATE ?? new Date().toISOString();

let counts = { High: 0, Medium: 0, Low: 0, Informational: 0 };
const rows = [];
let scanStatus = "completed";

if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const sites = report.site ?? [];
  for (const site of sites) {
    for (const alert of site.alerts ?? []) {
      recordAlert(alert, counts, rows);
    }
  }
} else {
  scanStatus = "no report artefact found";
}

/** Tally an alert's risk level and append its summary row, in place. */
function recordAlert(alert, counts, rows) {
  const risk = alert.riskdesc?.split(" ")[0] ?? "Informational";
  if (risk in counts) counts[risk]++;
  rows.push({
    risk,
    name: alert.name,
    cwe: alert.cweid,
    wasc: alert.wascid,
    instances: (alert.instances ?? []).length,
  });
}

const riskOrder = { High: 0, Medium: 1, Low: 2, Informational: 3 };
rows.sort((a, b) => (riskOrder[a.risk] ?? 9) - (riskOrder[b.risk] ?? 9));

const summary = `**Target:** ${target}  \n**Scanned:** ${scanDate}  \n**Scanner:** OWASP ZAP baseline (Docker \`zaproxy/zap-stable\`)  \n**Scope:** unauthenticated crawl of the published site; passive rules only; policy in \`.zap/rules.tsv\`.${runUrl ? `  \n**CI run:** ${runUrl}` : ""}`;

const totals = `| High | Medium | Low | Informational |
| ---: | -----: | --: | ------------: |
| ${counts.High} | ${counts.Medium} | ${counts.Low} | ${counts.Informational} |`;

let findings;
if (rows.length === 0) {
  findings =
    scanStatus === "completed"
      ? "_No alerts reported._"
      : `_Scan did not produce a report (${scanStatus})._`;
} else {
  findings =
    "| Risk | Alert | CWE | Instances |\n| --- | --- | --- | ---: |\n" +
    rows
      .map((r) => `| ${r.risk} | ${escapeCell(r.name)} | ${r.cwe ?? "-"} | ${r.instances} |`)
      .join("\n");
}

const block = `${START}\n${summary}\n\n${totals}\n\n${findings}\n${END}`;

const doc = readFileSync(DOC, "utf8");
const re = new RegExp(`${escapeRegex(START)}[\\s\\S]*?${escapeRegex(END)}`);
if (!re.test(doc)) {
  console.error("ZAP marker block not found in docs/COMPLIANCE.md");
  process.exit(1);
}
writeFileSync(DOC, doc.replace(re, block));
console.log(
  `Updated ${DOC} — H:${counts.High} M:${counts.Medium} L:${counts.Low} I:${counts.Informational}`,
);

function escapeCell(s) {
  return String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
