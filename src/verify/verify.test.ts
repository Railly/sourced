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

test("level 1 localizes audit reasons in Spanish without changing verification", async () => {
  const result = await verify(draft({ evidence_ids: [] }), evidence, {
    adversarial: false,
    locale: "es",
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed[0]?.reason).toContain("no tiene evidence_ids");
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

test("level 1 rejects a severity row bound to the wrong medication pair", async () => {
  const swappedEvidence: EvidenceObject[] = [
    {
      id: "ddinter:wrong",
      claim_text: "DDInter severity for sertraline + dextromethorphan: Major",
      source_name: "DDInter",
      source_id: "a/b",
      source_url: "https://example.test/ddinter",
      exact_field: "Level",
      quoted_text: "Drug_A: Sertraline; Drug_B: Dextromethorphan; Level: Major",
      subject_drugs: ["Sertraline", "Dextromethorphan"],
      retrieval_query: "row a x b",
      retrieved_at: "2026-07-09T00:00:00Z",
    },
  ];
  const result = await verify(
    draft({ drugs: ["warfarin", "amiodarone"], evidence_ids: ["ddinter:wrong"] }),
    swappedEvidence,
    { adversarial: false },
  );
  expect(result.findings).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("outside finding.drugs");
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

test("level 1 rejects findings that include a historical medication", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "warfarin", name: "warfarin", rxcui: "1", resolution: "exact", status: "active" },
      { raw: "amiodarone", name: "amiodarone", rxcui: "2", resolution: "exact", status: "historical" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const result = await verify(
    draft({
      drugs: ["warfarin", "amiodarone"],
      evidence_ids: ["label:1:interactions"],
    }),
    evidence,
    { adversarial: false, patient },
  );
  expect(result.findings).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("non-active medication(s): amiodarone");
});

test("level 1 allows a source brand mention when its declared ingredient is in finding scope", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "sertraline", name: "sertraline", rxcui: "1", resolution: "exact" },
      {
        raw: "Bromfed DM (dextromethorphan 10 mg)",
        name: "Bromfed DM",
        rxcui: "2",
        resolution: "approximate",
        ingredients: [{ rxcui: "3", name: "dextromethorphan" }],
      },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const result = await verify(
    draft({
      drugs: ["sertraline", "dextromethorphan"],
      why_this_patient: "The source states that this patient received Bromfed DM with sertraline.",
      evidence_ids: ["label:1:interactions"],
    }),
    evidence,
    { adversarial: false, patient },
  );
  expect(result.findings).toHaveLength(1);
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

test("level 2 rejects a contradictory supported verdict", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => ({
      supported: true,
      unsupported_claims: ["claim still exceeds source"],
    }),
  });
  expect(result.findings).toEqual([]);
  expect(result.unverified_removed[0]?.reason).toContain("claim still exceeds source");
});

test("level 2 receives the exact patient context", async () => {
  const patient: PatientContext = {
    note: "new medication",
    medications: [
      { raw: "a", name: "a", rxcui: "a", resolution: "exact" },
      { raw: "b", name: "b", rxcui: "b", resolution: "exact" },
    ],
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
    medications: [
      { raw: "a", name: "a", rxcui: "a", resolution: "exact" },
      { raw: "b", name: "b", rxcui: "b", resolution: "exact" },
    ],
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

test("narrative fallback is localized in Spanish", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "a", name: "a", rxcui: "a", resolution: "exact" },
      { raw: "b", name: "b", rxcui: "b", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    patient,
    locale: "es",
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
    narrativeReviewer: async () => ({
      summary_supported: false,
      unsupported_summary_claims: ["resumen no respaldado"],
      supported_question_indexes: [],
      unsupported_questions: [],
    }),
  });
  expect(result.patient_summary).toBe("Contexto del paciente recibido. Solo se muestran hallazgos verificados.");
  expect(result.unverified_removed[0]?.reason).toContain("Revisor narrativo");
});

test("narrative review fails closed when unavailable", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "a", name: "a", rxcui: "a", resolution: "exact" },
      { raw: "b", name: "b", rxcui: "b", resolution: "exact" },
    ],
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

test("narrative review rejects contradictory supported fields", async () => {
  const patient: PatientContext = {
    medications: [
      { raw: "a", name: "a", rxcui: "a", resolution: "exact" },
      { raw: "b", name: "b", rxcui: "b", resolution: "exact" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  };
  const report = draft({ evidence_ids: ["label:1:interactions"] });
  report.questions_for_clinician = ["question?"];
  const result = await verify(report, evidence, {
    patient,
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
    narrativeReviewer: async () => ({
      summary_supported: true,
      unsupported_summary_claims: ["summary contradiction"],
      supported_question_indexes: [0],
      unsupported_questions: [{ index: 0, unsupported_claims: ["question contradiction"] }],
    }),
  });
  expect(result.patient_summary).toContain("Only verified findings");
  expect(result.questions_for_clinician).toEqual([]);
  expect(result.unverified_removed.map((item) => item.reason).join(" ")).toContain(
    "summary contradiction",
  );
  expect(result.unverified_removed.map((item) => item.reason).join(" ")).toContain(
    "question contradiction",
  );
});
