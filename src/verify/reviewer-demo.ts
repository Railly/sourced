// Reviewer demo — an EXPLICIT, labeled test of the adversarial verifier.
// This is not disguised as natural output. Its purpose: prove the reviewer
// rejects a claim that goes beyond its cited source, on camera and in CI.
//
// We hand the verifier a finding that cites a REAL evidence object (the warfarin
// FDA label) but asserts a specific number the label does not contain. A correct
// reviewer must flag it as unsupported and remove it.

import type { EvidenceObject, Finding, SafetyReport } from "../types/index.ts";
import { verify } from "./index.ts";

const NOW = "2026-07-09T18:00:00.000Z";

const warfarinLabel: EvidenceObject = {
  id: "label:11289:interactions",
  claim_text: "FDA label drug-interactions section for warfarin",
  source_name: "openFDA-label",
  source_id: "0cbce382-9c88-4f58-ae0f-532a841e8f95",
  source_url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0cbce382-9c88-4f58-ae0f-532a841e8f95",
  exact_field: "drug_interactions",
  quoted_text:
    "Inhibitors of CYP2C9, 1A2, and/or 3A4 have the potential to increase the effect (increase INR) of warfarin by increasing the exposure of warfarin. Table 2: Examples of CYP450 Interactions with Warfarin — CYP2C9 Inhibitors: amiodarone, capecitabine, cotrimoxazole, fluconazole, metronidazole, miconazole, voriconazole. More frequent INR monitoring should be performed when starting or stopping other drugs. Closely monitor INR if a concomitant drug is a CYP2C9, 1A2, and/or 3A4 inhibitor or inducer.",
  retrieval_query: 'https://api.fda.gov/drug/label.json?search=openfda.generic_name:"warfarin"&limit=1',
  retrieved_at: NOW,
};

// A well-supported finding — should survive.
const supportedFinding: Finding = {
  status: "flagged",
  severity: "major",
  drugs: ["warfarin", "cotrimoxazole"],
  headline: "Cotrimoxazole is a CYP2C9 inhibitor that can increase warfarin's effect and INR",
  mechanism:
    "The warfarin label's Table 2 lists cotrimoxazole among CYP2C9 inhibitors, and states inhibitors of CYP2C9 can increase the effect (increase INR) of warfarin; it advises closely monitoring INR when a concomitant drug is a CYP2C9 inhibitor.",
  monitoring: "Closely monitor INR when a concomitant CYP2C9 inhibitor is present.",
  why_this_patient: "Antibiotic newly started on chronic warfarin.",
  evidence_ids: ["label:11289:interactions"],
};

// An over-asserted finding — cites the SAME real label but invents a specific
// numeric claim ("increases INR by exactly 3 points within 48 hours") that the
// quoted text does not contain. A correct reviewer must reject this.
const overAssertedFinding: Finding = {
  status: "red-flag",
  severity: "major",
  drugs: ["warfarin", "cotrimoxazole"],
  headline: "Cotrimoxazole increases INR by exactly 3 points within 48 hours",
  mechanism:
    "Per the FDA warfarin label, cotrimoxazole raises the INR by exactly 3.0 points within 48 hours and requires halving the warfarin dose immediately.",
  monitoring: "Halve the warfarin dose within 48 hours.",
  why_this_patient: "Antibiotic newly started on chronic warfarin.",
  evidence_ids: ["label:11289:interactions"],
};

const draft: SafetyReport = {
  patient_summary: "Reviewer demo.",
  findings: [supportedFinding, overAssertedFinding],
  questions_for_clinician: [],
  evidence: [warfarinLabel],
  unverified_removed: [],
  generated_at: NOW,
};

const result = await verify(draft, [warfarinLabel]);

console.log("=== Reviewer demo (labeled test, not natural output) ===\n");
console.log("Two findings cite the SAME real FDA warfarin label.");
console.log("One stays within the source. One invents a specific number the label does not contain.\n");
console.log("SURVIVED (claims trace to the cited source):");
for (const f of result.findings) console.log(`  ✓ ${f.headline}`);
console.log("\nREJECTED (claim goes beyond the cited source — not asserted):");
for (const r of result.unverified_removed) {
  console.log(`  ✗ ${r.claim_text}`);
  console.log(`     ${r.reason}`);
}

const rejectedTheFabrication = result.unverified_removed.some((r) =>
  r.claim_text.includes("exactly 3 points"),
);
const keptTheSupported = result.findings.some((f) => f.headline.startsWith("Cotrimoxazole is a CYP2C9"));
if (!rejectedTheFabrication || !keptTheSupported) {
  console.error("\nREVIEWER DEMO FAILED: verifier did not behave as expected.");
  process.exit(1);
}
console.log("\nReviewer correctly kept the supported finding and rejected the fabricated one.");
