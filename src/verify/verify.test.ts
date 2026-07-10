import { expect, test } from "bun:test";
import type { EvidenceObject, PatientContext, SafetyReport } from "../types/index.ts";
import { verify } from "./index.ts";

const evidence: EvidenceObject[] = [
  {
    id: "label:1:interactions",
    claim_text: "x",
    source_name: "openFDA-label",
    source_id: "s1",
    source_url: "https://example.test/1",
    exact_field: "drug_interactions",
    quoted_text: "some text",
    retrieval_query: "q",
    retrieved_at: "2026-07-09T00:00:00Z",
  },
];

function draft(overrides: Partial<SafetyReport["findings"][number]>): SafetyReport {
  return {
    patient_summary: "t",
    findings: [
      {
        status: "flagged",
        severity: "major",
        drugs: ["a", "b"],
        headline: "h",
        mechanism: "m",
        why_this_patient: "w",
        evidence_ids: [],
        ...overrides,
      },
    ],
    questions_for_clinician: [],
    evidence,
    unverified_removed: [],
    generated_at: "2026-07-09T00:00:00Z",
  };
}

// Level 1 (deterministic) runs regardless of the adversarial pass. Disable
// adversarial so these are hermetic (no model call).

test("level 1 removes a finding with no evidence_ids", async () => {
  const result = await verify(draft({ evidence_ids: [] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed).toHaveLength(1);
  expect(result.unverified_removed[0]?.reason).toContain("no evidence_ids");
});

test("level 1 removes a finding citing an unknown evidence_id", async () => {
  const result = await verify(draft({ evidence_ids: ["label:999:nope"] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed[0]?.reason).toContain("Unresolved evidence_id");
});

test("level 1 keeps a finding whose evidence_ids all resolve", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(1);
  expect(result.unverified_removed).toHaveLength(0);
});

test("level 1 dedupes repeated evidence_ids", async () => {
  const result = await verify(
    draft({ evidence_ids: ["label:1:interactions", "label:1:interactions"] }),
    evidence,
    { adversarial: false },
  );
  expect(result.findings[0]?.evidence_ids).toEqual(["label:1:interactions"]);
});

test("level 1 removes patient reasoning that names a medication outside finding scope", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "warfarin", name: "warfarin", rxcui: "1", resolution: "exact" },
      { raw: "amiodarone", name: "amiodarone", rxcui: "2", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const report = draft({
    drugs: ["warfarin"],
    why_this_patient: "Amiodarone was newly started with warfarin.",
    evidence_ids: ["label:1:interactions"],
  });
  const result = await verify(report, evidence, { adversarial: false, patient });
  expect(result.findings).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("outside finding.drugs: amiodarone");
});

test("level 1 removes plural medication context from a single-drug finding", async () => {
  const patient: PatientContext = {
    medications: [{ raw: "warfarin", name: "warfarin", rxcui: "1", resolution: "exact" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const report = draft({
    drugs: ["warfarin"],
    why_this_patient: "Two newly started drugs may affect this patient.",
    evidence_ids: ["label:1:interactions"],
  });
  const result = await verify(report, evidence, { adversarial: false, patient });
  expect(result.findings).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("plural medication context");
});

test("level 2 fails closed when the adversarial reviewer is unavailable", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => {
      throw new Error("reviewer unavailable");
    },
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed).toHaveLength(1);
  expect(result.unverified_removed[0]?.reason).toContain("not rendered");
});

test("level 2 removes a finding that goes beyond its cited source", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => ({
      supported: false,
      unsupported_claims: ["exact numeric increase is absent"],
    }),
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed[0]?.reason).toContain("exact numeric increase is absent");
});

test("level 2 keeps a finding fully supported by its cited source", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
  });
  expect(result.findings).toHaveLength(1);
  expect(result.unverified_removed).toHaveLength(0);
});

test("level 2 receives the exact patient context", async () => {
  const patient: PatientContext = {
    note: "new medication",
    medications: [],
    allergies: [],
    diagnoses: ["atrial fibrillation"],
    labs: [{ name: "INR", value: 2.6, unit: "" }],
  };
  let receivedPatient: PatientContext | undefined;
  await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    patient,
    narrative: false,
    reviewer: async (_finding, _evidence, reviewerPatient) => {
      receivedPatient = reviewerPatient;
      return { supported: true, unsupported_claims: [] };
    },
  });
  expect(receivedPatient).toEqual(patient);
});

test("narrative review removes unsupported summary and questions", async () => {
  const patient: PatientContext = {
    medications: [],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const report = draft({ evidence_ids: ["label:1:interactions"] });
  report.questions_for_clinician = ["supported?", "unsupported?"];
  const result = await verify(report, evidence, {
    patient,
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
    narrativeReviewer: async () => ({
      summary_supported: false,
      unsupported_summary_claims: ["summary overreaches"],
      supported_question_indexes: [0],
      unsupported_questions: [{ index: 1, unsupported_claims: ["question overreaches"] }],
    }),
  });
  expect(result.patient_summary).toContain("Only verified findings");
  expect(result.questions_for_clinician).toEqual(["supported?"]);
  expect(result.unverified_removed.map((item) => item.reason).join(" ")).toContain(
    "summary overreaches",
  );
  expect(result.unverified_removed.map((item) => item.reason).join(" ")).toContain(
    "question overreaches",
  );
});

test("narrative review fails closed when unavailable", async () => {
  const patient: PatientContext = {
    medications: [],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const report = draft({ evidence_ids: ["label:1:interactions"] });
  report.questions_for_clinician = ["question?"];
  const result = await verify(report, evidence, {
    patient,
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
    narrativeReviewer: async () => {
      throw new Error("unavailable");
    },
  });
  expect(result.patient_summary).toContain("Only verified findings");
  expect(result.questions_for_clinician).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("Narrative reviewer unavailable");
});
