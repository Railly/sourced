import { expect, test } from "bun:test";
import type { EvidenceObject, Finding, PatientContext } from "../types/index.ts";
import {
  canonicalizeRequiredPairFindings,
  canonicalizeExplicitClassPairs,
  constrainPatientReasoning,
  missingRequiredPairEvidence,
} from "./index.ts";

const pairEvidence: EvidenceObject = {
  id: "ddinter:rivaroxaban:amiodarone",
  claim_text: "DDInter severity for rivaroxaban + amiodarone: Moderate",
  source_name: "DDInter",
  source_id: "DDInter1/DDInter2",
  source_url: "https://ddinter.scbdd.com/",
  quoted_text: "Drug_A: Rivaroxaban; Drug_B: Amiodarone; Level: Moderate",
  subject_drugs: ["Rivaroxaban", "Amiodarone"],
  retrieval_query: "local DDInter row",
  retrieved_at: "2026-07-11T00:00:00.000Z",
};

function finding(drugs: string[], evidenceIds: string[]): Finding {
  return {
    status: "flagged",
    severity: "moderate",
    drugs,
    headline: "Structured interaction",
    mechanism: "DDInter classifies the pair as Moderate.",
    why_this_patient: "Both medications were active during the episode.",
    evidence_ids: evidenceIds,
  };
}

test("requires a concrete DDInter pair in one cited finding", () => {
  const split = [
    finding(["rivaroxaban"], [pairEvidence.id]),
    finding(["amiodarone"], [pairEvidence.id]),
  ];
  expect(missingRequiredPairEvidence(split, [pairEvidence])).toEqual([pairEvidence]);
  expect(
    missingRequiredPairEvidence(
      [finding(["rivaroxaban", "amiodarone"], [pairEvidence.id])],
      [pairEvidence],
    ),
  ).toEqual([]);
});

test("requires the exact pair evidence id", () => {
  expect(
    missingRequiredPairEvidence(
      [finding(["rivaroxaban", "amiodarone"], ["label:rivaroxaban"])],
      [pairEvidence],
    ),
  ).toEqual([pairEvidence]);
});

test("ignores Unknown DDInter rows and recognizes a declared ingredient", () => {
  const unknown = {
    ...pairEvidence,
    id: "ddinter:unknown",
    quoted_text: "Drug_A: Sertraline; Drug_B: Methimazole; Level: Unknown",
    subject_drugs: ["Sertraline", "Methimazole"],
  };
  expect(
    missingRequiredPairEvidence(
      [finding(["sertraline", "Bromfed DM (dextromethorphan)"], [pairEvidence.id])],
      [{ ...pairEvidence, subject_drugs: ["Sertraline", "Dextromethorphan"] }, unknown],
    ),
  ).toEqual([]);
});

test("canonicalizes structured pair findings without model-authored clinical detail", () => {
  const output = canonicalizeRequiredPairFindings(
    [
      finding(["rivaroxaban", "amiodarone"], [pairEvidence.id, "label:rivaroxaban"]),
      finding(["rivaroxaban"], ["label:rivaroxaban"]),
    ],
    [pairEvidence],
  );
  expect(output[0]).toEqual({
    status: "flagged",
    severity: "moderate",
    drugs: ["Rivaroxaban", "Amiodarone"],
    headline: "Rivaroxaban + Amiodarone interaction",
    mechanism: "DDInter classifies the exact Rivaroxaban + Amiodarone pair as Moderate.",
    why_this_patient: "Both Rivaroxaban and Amiodarone are active in the reviewed medication-safety episode.",
    evidence_ids: [pairEvidence.id],
  });
  expect(output[1]?.evidence_ids).toEqual(["label:rivaroxaban"]);
});

test("canonicalizes structured pair findings in Spanish without changing identifiers", () => {
  const output = canonicalizeRequiredPairFindings(
    [finding(["rivaroxaban", "amiodarone"], [pairEvidence.id])],
    [pairEvidence],
    "es",
  );
  expect(output[0]).toMatchObject({
    status: "flagged",
    severity: "moderate",
    drugs: ["Rivaroxaban", "Amiodarone"],
    headline: "Interacción entre Rivaroxaban y Amiodarone",
    evidence_ids: [pairEvidence.id],
  });
  expect(output[0]?.mechanism).toContain("gravedad moderada");
});

test("removes active medication names outside finding scope from patient reasoning", () => {
  const patient: PatientContext = {
    medications: [
      { raw: "spironolactone", name: "Spironolactone", rxcui: "999", resolution: "exact" },
      { raw: "ramipril", name: "Ramipril", rxcui: "888", resolution: "exact" },
      { raw: "furosemide", name: "Furosemide", rxcui: "777", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const output = constrainPatientReasoning(
    [{
      ...finding(["Spironolactone", "Ramipril"], ["label:spironolactone"]),
      why_this_patient: "The patient also received furosemide during the episode.",
    }],
    patient,
  );
  expect(output[0]?.why_this_patient).toBe(
    "The medications in this finding are active in the reviewed medication-safety episode.",
  );
});

test("localizes constrained patient reasoning in Spanish", () => {
  const patient: PatientContext = {
    medications: [
      { raw: "warfarin", name: "Warfarin", rxcui: "1", resolution: "exact" },
      { raw: "amiodarone", name: "Amiodarone", rxcui: "2", resolution: "exact" },
      { raw: "furosemide", name: "Furosemide", rxcui: "3", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const output = constrainPatientReasoning(
    [{ ...finding(["Warfarin", "Amiodarone"], [pairEvidence.id]), why_this_patient: "Furosemide también estaba activo." }],
    patient,
    "es",
  );
  expect(output[0]?.why_this_patient).toBe(
    "Los medicamentos de este hallazgo están activos en el episodio de seguridad de medicamentos revisado.",
  );
});

test("preserves a source brand when its declared ingredient is in finding scope", () => {
  const patient: PatientContext = {
    medications: [{
      raw: "Bromfed DM",
      name: "Bromfed DM",
      rxcui: "123",
      resolution: "exact",
      ingredients: [{ rxcui: "456", name: "Dextromethorphan" }],
    }],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const sourceFinding = {
    ...finding(["Sertraline", "Dextromethorphan"], [pairEvidence.id]),
    why_this_patient: "Dextromethorphan is source-declared inside Bromfed DM.",
  };
  expect(constrainPatientReasoning([sourceFinding], patient)[0]).toEqual(sourceFinding);
});

test("canonicalizes a source-declared ACE inhibitor with the spironolactone label", () => {
  const patient: PatientContext = {
    medications: [
      { raw: "spironolactone 100 mg", name: "Spironolactone", rxcui: "999", resolution: "exact" },
      { raw: "ramipril 5 mg", name: "Ramipril", rxcui: "888", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const label: EvidenceObject = {
    id: "label:spironolactone:interactions",
    claim_text: "FDA label drug-interactions section for spironolactone",
    source_name: "openFDA-label",
    source_id: "spironolactone-label",
    source_url: "https://api.fda.gov/",
    quoted_text: "Concomitant administration may lead to severe hyperkalemia. Examples include ACE inhibitors.",
    anchor_drug: "spironolactone",
    retrieval_query: "openFDA spironolactone",
    retrieved_at: "2026-07-11T00:00:00.000Z",
  };
  const ramiprilLabel: EvidenceObject = {
    ...label,
    id: "label:ramipril:interactions",
    source_id: "ramipril-label",
    anchor_drug: "ramipril",
    quoted_text: "Increased lithium levels have been reported in patients receiving ACE inhibitors, including ramipril.",
  };
  const output = canonicalizeExplicitClassPairs([], [label, ramiprilLabel], patient);
  expect(output).toHaveLength(1);
  expect(output[0]).toMatchObject({
    status: "red-flag",
    severity: "major",
    drugs: ["spironolactone", "Ramipril"],
    evidence_ids: [label.id, ramiprilLabel.id],
  });
});
