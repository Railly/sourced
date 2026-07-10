import type { EvidenceObject, Finding, PatientContext, SafetyReport } from "../types/index.ts";
import { verify } from "./index.ts";

const NOW = "2026-07-09T18:00:00.000Z";

const amiodaroneLabel: EvidenceObject = {
  id: "label:703:interactions",
  claim_text: "FDA label drug-interactions section for amiodarone",
  source_name: "openFDA-label",
  source_id: "02f4a736-63ed-4ad4-a1f1-b21a71e928bd",
  source_url:
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=02f4a736-63ed-4ad4-a1f1-b21a71e928bd",
  exact_field: "drug_interactions",
  quoted_text:
    "Warfarin: Potentiates anticoagulant response and can result in serious or fatal bleeding. Coadministration increases prothrombin time by 100% after 3 to 4 days. Reduce warfarin dose by one-third to one-half and monitor prothrombin times. Amiodarone inhibits CYP2C9, increasing exposure to other drugs.",
  retrieval_query:
    'https://api.fda.gov/drug/label.json?search=openfda.generic_name:"amiodarone"&limit=1',
  retrieved_at: NOW,
};

const ddinterSeverity: EvidenceObject = {
  id: "ddinter:DDInter1951:DDInter76",
  claim_text: "DDInter severity for warfarin + amiodarone: Major",
  source_name: "DDInter",
  source_id: "DDInter1951/DDInter76",
  source_url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8728114/",
  exact_field: "Level",
  quoted_text: "Major",
  retrieval_query: "local DDInter CSV row: DDInter1951 (Warfarin) x DDInter76 (Amiodarone)",
  retrieved_at: NOW,
};

const patient: PatientContext = {
  note: "Amiodarone was newly started at discharge. The patient takes chronic warfarin.",
  medications: [
    { raw: "warfarina 5mg", name: "warfarin", rxcui: "11289", resolution: "exact" },
    { raw: "amiodarona 200mg", name: "amiodarone", rxcui: "703", resolution: "exact" },
  ],
  allergies: [],
  diagnoses: ["Atrial fibrillation"],
  labs: [{ name: "INR", value: 2.6, unit: "", refLow: 2, refHigh: 3 }],
};

// A well-supported finding — should survive.
const supportedFinding: Finding = {
  status: "flagged",
  severity: "major",
  drugs: ["warfarin", "amiodarone"],
  headline: "Amiodarone can potentiate warfarin's anticoagulant response",
  mechanism:
    "The amiodarone label says it inhibits CYP2C9 and potentiates warfarin's anticoagulant response.",
  monitoring: "Reduce the warfarin dose by one-third to one-half and monitor prothrombin times.",
  why_this_patient: "Amiodarone was newly started while the patient takes chronic warfarin.",
  evidence_ids: ["label:703:interactions", "ddinter:DDInter1951:DDInter76"],
};

const overAssertedFinding: Finding = {
  status: "red-flag",
  severity: "major",
  drugs: ["warfarin", "amiodarone"],
  headline: "Amiodarone increases INR by exactly 3 points within 48 hours",
  mechanism:
    "Per the FDA amiodarone label, amiodarone raises the INR by exactly 3.0 points within 48 hours and requires halving the warfarin dose immediately.",
  monitoring: "Halve the warfarin dose within 48 hours.",
  why_this_patient: "Amiodarone was newly started while the patient takes chronic warfarin.",
  evidence_ids: ["label:703:interactions", "ddinter:DDInter1951:DDInter76"],
};

const draft: SafetyReport = {
  patient_summary: "Reviewer demo.",
  findings: [supportedFinding, overAssertedFinding],
  questions_for_clinician: [],
  evidence: [amiodaroneLabel, ddinterSeverity],
  unverified_removed: [],
  generated_at: NOW,
};

const evidence = [amiodaroneLabel, ddinterSeverity];
const result = await verify(draft, evidence, { patient, narrative: false });

console.log("=== Reviewer demo (labeled test, not natural output) ===\n");
console.log("Two findings cite the SAME real source set.");
console.log(
  "One stays within the source. One invents a specific number the label does not contain.\n",
);
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
const keptTheSupported = result.findings.some((f) =>
  f.headline.startsWith("Amiodarone can potentiate"),
);
if (!rejectedTheFabrication || !keptTheSupported) {
  console.error("\nREVIEWER DEMO FAILED: verifier did not behave as expected.");
  process.exit(1);
}
console.log("\nReviewer correctly kept the supported finding and rejected the fabricated one.");
console.log("\n=== Camera summary ===");
console.log("SUPPORTED: cited interaction, severity, monitoring, and patient context");
console.log("REJECTED: exact 3-point INR increase, 48-hour timing, and immediate dose halving");
console.log("RESULT: unsupported claim never rendered");
