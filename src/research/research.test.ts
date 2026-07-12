import { expect, test } from "bun:test";
import { createDdinterDataset, type DdinterRow } from "../retrieve/ddinter.ts";
import type { PatientContext, SafetyReport } from "../types/index.ts";
import { deriveResearchCandidates } from "./index.ts";

function dataset(rows: DdinterRow[]) {
  return createDdinterDataset(rows);
}

function patient(names: string[]): PatientContext {
  return {
    medications: names.map((name) => ({ raw: name, name, rxcui: name, resolution: "exact", status: "active" })),
    allergies: [],
    diagnoses: [],
    labs: [],
  };
}

function report(over: Partial<SafetyReport> = {}): SafetyReport {
  return {
    patient_summary: "s",
    findings: [],
    questions_for_clinician: [],
    evidence: [],
    unverified_removed: [],
    generated_at: "2026-07-12T00:00:00.000Z",
    ...over,
  };
}

test("routes a DDInter Unknown pair as a known-unknown candidate", () => {
  const dd = dataset([{ idA: "D1", drugA: "Warfarin", idB: "D2", drugB: "Furosemide", level: "Unknown" }]);
  const derived = deriveResearchCandidates(patient(["warfarin", "furosemide"]), report(), dd);
  expect(derived.totalKnownUnknown).toBe(1);
  expect(derived.candidates[0]).toMatchObject({ tier: "known-unknown", drugs: ["Warfarin", "Furosemide"] });
});

test("does not route a graded pair or a benign no-data pair", () => {
  const dd = dataset([{ idA: "D1", drugA: "Warfarin", idB: "D3", drugB: "Amiodarone", level: "Major" }]);
  const derived = deriveResearchCandidates(patient(["warfarin", "amiodarone", "acetaminophen"]), report(), dd);
  expect(derived.candidates).toHaveLength(0);
});

test("routes an adversarially removed concern and ranks it first", () => {
  const dd = dataset([{ idA: "D1", drugA: "Warfarin", idB: "D2", drugB: "Furosemide", level: "Unknown" }]);
  const derived = deriveResearchCandidates(
    patient(["warfarin", "furosemide"]),
    report({ unverified_removed: [{ claim_text: "X raises INR", reason: "not traceable" }] }),
    dd,
  );
  expect(derived.candidates[0]?.tier).toBe("unresolved-concern");
  expect(derived.candidates.some((c) => c.tier === "known-unknown")).toBe(true);
});

test("caps the displayed queue but preserves the full known-unknown count", () => {
  const rows: DdinterRow[] = Array.from({ length: 8 }, (_, index) => ({
    idA: "A", drugA: "tamoxifen", idB: `B${index}`, drugB: `drug${index}`, level: "Unknown",
  }));
  const dd = dataset(rows);
  const derived = deriveResearchCandidates(patient(["tamoxifen", ...rows.map((r) => r.drugB)]), report(), dd, 5);
  expect(derived.candidates).toHaveLength(5);
  expect(derived.totalKnownUnknown).toBe(8);
});

test("skips a pair already covered by a finding", () => {
  const dd = dataset([{ idA: "D1", drugA: "Warfarin", idB: "D2", drugB: "Furosemide", level: "Unknown" }]);
  const derived = deriveResearchCandidates(
    patient(["warfarin", "furosemide"]),
    report({ findings: [{ status: "flagged", severity: "minor", drugs: ["Warfarin", "Furosemide"], headline: "h", mechanism: "m", why_this_patient: "w", evidence_ids: ["e"] }] }),
    dd,
  );
  expect(derived.candidates).toHaveLength(0);
});
