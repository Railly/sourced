import { describe, expect, test } from "bun:test";
import type { IntakeExtraction } from "@/lib/intake";
import {
  extractSourceMedicationCandidates,
  repairConservativeActiveStatuses,
  repairCoordinatedMedicationIdentities,
  repairExplicitActiveMedicationCandidates,
  repairExplicitOneTimeMedicationCandidates,
  repairIndirectExposureStatuses,
  repairMedicationSourceSpans,
  repairSourceSummary,
  validateSourceAnchoredIntake,
} from "@/lib/intake-anchoring";

const source = "Methadone, Metoclopramide and Metronidazole Interaction Causing Torsades de Pointes. The patient was on methadone maintenance. She received intravenous metoclopramide 10 mg. Metronidazole was started about 45 min later.";
const drugNames = ["Methadone", "Metoclopramide", "Metronidazole", "Warfarin"];

function extraction(medications: IntakeExtraction["case"]["medications"]): IntakeExtraction {
  return {
    case: { medications, allergies: [], diagnoses: [], labs: [] },
    ambiguities: [],
    sourceSummary: "Source-grounded medication episode.",
  };
}

describe("intake source anchoring", () => {
  test("detects exact DDInter medications in title and exposure contexts", () => {
    expect(extractSourceMedicationCandidates(source, drugNames).map((candidate) => candidate.name)).toEqual([
      "Methadone",
      "Metoclopramide",
      "Metronidazole",
    ]);
  });

  test("detects a structured RxNorm abbreviation as a literal source candidate", () => {
    const aliasSource = "A case of possible anaphylaxis to ASA. She underwent an oral challenge to ASA.";
    expect(extractSourceMedicationCandidates(aliasSource, ["ASA"], 32, 2).map((candidate) => candidate.name)).toEqual([
      "ASA",
    ]);
  });

  test("derives a coordinated medication identity from canonical lexicon siblings", () => {
    const caseSource = "The patient was undergoing treatment with Insulin Lispro and Glargine.";
    const candidates = extractSourceMedicationCandidates(caseSource, ["Insulin lispro", "Insulin glargine", "Warfarin"]);
    expect(candidates.map((candidate) => candidate.name)).toEqual(["Insulin lispro", "Insulin glargine"]);
    expect(candidates[1]?.excerpt).toBe(caseSource);
  });

  test("repairs a unique coordinated medication identity", () => {
    const caseSource = "The patient was undergoing treatment with Insulin Lispro and Glargine.";
    const candidates = extractSourceMedicationCandidates(caseSource, ["Insulin lispro", "Insulin glargine"]);
    const repaired = repairCoordinatedMedicationIdentities(caseSource, extraction([
      { raw: "Insulin Lispro", status: "active", source_span: caseSource },
      { raw: "Glargine", status: "active", source_span: caseSource },
    ]), candidates);
    expect(repaired.case.medications.map((medication) => medication.raw)).toEqual([
      "Insulin Lispro",
      "Insulin glargine",
    ]);
    expect(validateSourceAnchoredIntake(caseSource, repaired, candidates).ok).toBe(true);
  });

  test("anchors an acronym while rejecting route abbreviations as identity", () => {
    const aliasSource = "She underwent an oral challenge to ASA and received epinephrine IM.";
    const result = validateSourceAnchoredIntake(aliasSource, extraction([
      { raw: "ASA (acetylsalicylic acid)", status: "one-time", source_span: "oral challenge to ASA" },
    ]), []);
    expect(result.ok).toBe(true);
  });

  test("rejects placeholders and missing deterministic candidates", () => {
    const candidates = extractSourceMedicationCandidates(source, drugNames);
    const result = validateSourceAnchoredIntake(source, extraction([
      {
        raw: "Methadone (methadone maintenance)",
        status: "active",
        source_span: "The patient was on methadone maintenance.",
      },
      { raw: "placeholder", status: "active", source_span: "Metronidazole was started about 45 min later." },
    ]), candidates);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("Sentinel medication");
    expect(result.missingCandidates.map((candidate) => candidate.name)).toEqual([
      "Metoclopramide",
      "Metronidazole",
    ]);
  });

  test("accepts complete medications with verbatim identity spans", () => {
    const candidates = extractSourceMedicationCandidates(source, drugNames);
    const result = validateSourceAnchoredIntake(source, extraction([
      {
        raw: "methadone maintenance",
        status: "active",
        source_span: "The patient was on methadone maintenance.",
      },
      {
        raw: "intravenous metoclopramide 10 mg",
        status: "active",
        source_span: "She received intravenous metoclopramide 10 mg.",
      },
      {
        raw: "Metronidazole",
        status: "active",
        source_span: "Metronidazole was started about 45 min later.",
      },
    ]), candidates);
    expect(result).toEqual({ ok: true, issues: [], missingCandidates: [] });
  });

  test("rejects a source span that is not in the supplied source", () => {
    const result = validateSourceAnchoredIntake(source, extraction([
      {
        raw: "methadone",
        status: "active",
        source_span: "Methadone was newly prescribed yesterday.",
      },
    ]), []);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Medication source_span is not verbatim source text: methadone");
  });

  test("limits deterministic candidates to the first labeled patient", () => {
    const multiCase = "Case no 1. The patient received metoclopramide. Case no 2. The patient started warfarin.";
    expect(extractSourceMedicationCandidates(multiCase, drugNames).map((candidate) => candidate.name)).toEqual([
      "Metoclopramide",
    ]);
  });

  test("accepts an exact raw medication phrase when the verbatim span is shorter", () => {
    const caseSource = "Her medication was changed to tablet aceno- coumarol.";
    const result = validateSourceAnchoredIntake(caseSource, extraction([
      {
        raw: "tablet acenocoumarol",
        status: "active",
        source_span: "Her medication was changed",
      },
    ]), []);
    expect(result.ok).toBe(true);
  });

  test("repairs a missing span only from a literal source sentence", () => {
    const caseSource = "She was started on tablet furosemide 40 mg once daily. The patient denied warfarin use.";
    const repaired = repairMedicationSourceSpans(caseSource, extraction([
      { raw: "tablet furosemide 40 mg once daily", status: "active" },
      { raw: "placeholder", status: "uncertain" },
    ]));
    expect(repaired.case.medications[0]?.source_span).toBe("She was started on tablet furosemide 40 mg once daily.");
    expect(repaired.case.medications[1]?.source_span).toBeUndefined();
  });

  test("repairs an exact medication span inside a long merged PDF table", () => {
    const caseSource = `${"Table field ".repeat(55)}Treatment Oral corticosteroids Resolution time`;
    const repaired = repairMedicationSourceSpans(caseSource, extraction([
      { raw: "Oral corticosteroids", status: "one-time", source_span: "Oral corticosteroids were administered." },
    ]));
    expect(repaired.case.medications[0]?.source_span).toBe("Oral corticosteroids");
    expect(validateSourceAnchoredIntake(caseSource, repaired, []).ok).toBe(true);
  });

  test("repairs an annotated medication from its literal identity prefix", () => {
    const caseSource = "Following introduction of Genvoya concomitantly with simvastatin, the patient developed an adverse event.";
    const repaired = repairMedicationSourceSpans(caseSource, extraction([
      {
        raw: "Genvoya (elvitegravir/cobicistat/emtricitabine/tenofovir alafenamide); fixed-dose combination",
        status: "active",
      },
    ]));
    expect(repaired.case.medications[0]?.source_span).toBe("Genvoya");
    expect(validateSourceAnchoredIntake(caseSource, repaired, []).ok).toBe(true);
  });

  test("adds only explicit rescue and challenge candidates as one-time exposures", () => {
    const caseSource = "Ibuprofen caused urticaria requiring 2 doses of intramuscular epinephrine. She passed a treatment dose celecoxib challenge. ASA desensitization was offered should this medication be clinically indicated in the future.";
    const candidates = extractSourceMedicationCandidates(caseSource, ["Ibuprofen", "Epinephrine", "Celecoxib", "ASA"], 32, 2);
    const repaired = repairExplicitOneTimeMedicationCandidates(extraction([
      { raw: "Ibuprofen", status: "active", source_span: "Ibuprofen caused urticaria requiring 2 doses of intramuscular epinephrine." },
      { raw: "ASA", status: "historical", source_span: "ASA desensitization was offered should this medication be clinically indicated in the future." },
    ]), candidates);
    expect(repaired.case.medications.map((medication) => [medication.raw, medication.status])).toEqual([
      ["Ibuprofen", "active"],
      ["ASA", "historical"],
      ["Epinephrine", "one-time"],
      ["Celecoxib", "one-time"],
    ]);
    expect(validateSourceAnchoredIntake(caseSource, repaired, candidates).ok).toBe(true);
  });

  test("requires a candidate to have its own medication row", () => {
    const caseSource = "Ibuprofen caused urticaria requiring 2 doses of intramuscular epinephrine.";
    const candidates = extractSourceMedicationCandidates(caseSource, ["Ibuprofen", "Epinephrine"]);
    const result = validateSourceAnchoredIntake(caseSource, extraction([
      { raw: "Ibuprofen", status: "active", source_span: caseSource },
    ]), candidates);
    expect(result.missingCandidates.map((candidate) => candidate.name)).toEqual(["Epinephrine"]);
  });

  test("adds a missing candidate only from explicit active exposure language", () => {
    const caseSource = "The patient developed an adverse event following introduction of Genvoya concomitantly with simvastatin. Five months later, pravastatin was started.";
    const candidates = extractSourceMedicationCandidates(caseSource, ["Simvastatin", "Pravastatin"]);
    const repaired = repairExplicitActiveMedicationCandidates(caseSource, extraction([
      { raw: "Genvoya", status: "active", source_span: "Genvoya" },
    ]), candidates);
    expect(repaired.case.medications.map((medication) => [medication.raw, medication.status])).toEqual([
      ["Genvoya", "active"],
      ["Simvastatin", "active"],
    ]);
    const validation = validateSourceAnchoredIntake(caseSource, repaired, candidates);
    expect(validation.missingCandidates.map((candidate) => candidate.name)).toEqual(["Pravastatin"]);
  });

  test("preserves conservative active exposure absent an explicit stop", () => {
    const caseSource = "She was discharged on prescription of tablet ramipril 5 mg HS. Later she presented with hyperkalemia.";
    const repaired = repairConservativeActiveStatuses(caseSource, extraction([
      { raw: "tablet ramipril 5 mg HS", status: "uncertain", source_span: "tablet ramipril 5 mg HS" },
    ]));
    expect(repaired.case.medications[0]?.status).toBe("active");
    expect(repaired.case.medications[0]?.source_span).toBe("She was discharged on prescription of tablet ramipril 5 mg HS.");
  });

  test("corrects a one-time status contradicted by a discharge prescription", () => {
    const caseSource = "She was discharged on prescription of tablet ramipril 5 mg HS.";
    const repaired = repairConservativeActiveStatuses(caseSource, extraction([
      { raw: "tablet ramipril 5 mg HS", status: "one-time", end: "not stated", source_span: "tablet ramipril 5 mg HS" },
    ]));
    expect(repaired.case.medications[0]?.status).toBe("active");
  });

  test("does not promote historical or one-time exposure", () => {
    const caseSource = "She previously tolerated acetaminophen. She was given calcium gluconate after the event.";
    const repaired = repairConservativeActiveStatuses(caseSource, extraction([
      { raw: "acetaminophen", status: "historical", source_span: "She previously tolerated acetaminophen." },
      { raw: "calcium gluconate", status: "one-time", source_span: "She was given calcium gluconate after the event." },
    ]));
    expect(repaired.case.medications.map((medication) => medication.status)).toEqual(["historical", "one-time"]);
  });

  test("does not promote a medication with an explicit later hold", () => {
    const caseSource = "She was discharged on warfarin. Warfarin was held after the INR increased.";
    const repaired = repairConservativeActiveStatuses(caseSource, extraction([
      { raw: "warfarin", status: "held", source_span: "Warfarin was held after the INR increased." },
    ]));
    expect(repaired.case.medications[0]?.status).toBe("held");
  });

  test("classifies by-proxy trace contact outside the active medication list", () => {
    const caseSource = "He licked his child's spoon containing traces of amoxicillin syrup.";
    const repaired = repairIndirectExposureStatuses(caseSource, extraction([
      { raw: "amoxicillin", status: "active", source_span: "traces of amoxicillin syrup" },
    ]));
    expect(repaired.case.medications[0]?.status).toBe("indirect-exposure");
    expect(repaired.case.medications[0]?.source_span).toBe("He licked his child's spoon containing traces of amoxicillin syrup.");
  });

  test("classifies annotated by-proxy exposure inside a long merged PDF table", () => {
    const caseSource = `${"Table field ".repeat(55)}Indirect exposure to penicillins Allergen Amoxicillin Licking his child's spoon containing traces of amoxicillin syrup`;
    const repaired = repairIndirectExposureStatuses(caseSource, extraction([
      { raw: "Amoxicillin (traces of amoxicillin syrup on child's spoon)", status: "active" },
    ]));
    expect(repaired.case.medications[0]?.status).toBe("indirect-exposure");
    expect(repaired.case.medications[0]?.source_span).toContain("Amoxicillin");
    expect(validateSourceAnchoredIntake(caseSource, repaired, []).ok).toBe(true);
  });

  test("repairs an empty summary from literal source text", () => {
    const value = extraction([{ raw: "warfarin", status: "active", source_span: "warfarin" }]);
    value.sourceSummary = "";
    expect(repairSourceSummary("Warfarin interaction case report\nPatient details", value).sourceSummary).toBe(
      "Warfarin interaction case report",
    );
  });
});
