// Shows the pre-generated safety report without needing model credentials.
// For judges/reviewers who clone the repo and want to see the output immediately.
// The live pipeline is `bun run demo` (needs Claude Opus 4.8).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cachedPath = resolve(repoRoot, "out/report.json");

const file = Bun.file(cachedPath);
if (!(await file.exists())) {
  console.error("No cached report found at out/report.json. Run `bun run demo` first.");
  process.exit(1);
}

const ledger = await file.json();
const report = ledger.report ?? ledger;

console.log("Sourced — cached medication-safety report (golden HF/AFib discharge case)\n");
console.log(report.patient_summary, "\n");
console.log(`Findings (${report.findings.length}), ranked by severity:\n`);
for (const [i, f] of report.findings.entries()) {
  console.log(`${i + 1}. [${f.severity.toUpperCase()}] ${f.headline}`);
  console.log(`   drugs: ${f.drugs.join(" + ")}`);
  console.log(`   mechanism: ${f.mechanism}`);
  if (f.monitoring) console.log(`   monitoring: ${f.monitoring}`);
  console.log(`   why this patient: ${f.why_this_patient}`);
  console.log(`   cited evidence: ${f.evidence_ids.join(", ")}\n`);
}

if (report.unverified_removed?.length) {
  console.log("Reviewer rejected (claim not supported by cited source):");
  for (const r of report.unverified_removed) console.log(`   ✗ ${r.claim_text} — ${r.reason}`);
} else {
  console.log("All rendered claims trace to a cited source (reviewer verified).");
}
console.log("\nFull audit ledger: out/report.json");
