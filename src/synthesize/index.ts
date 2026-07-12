import type {
  EvidenceObject,
  Finding,
  PatientContext,
  ReviewLocale,
  SafetyReport,
  Severity,
  Status,
} from "../types/index.ts";
import { callOpus } from "../llm.ts";

interface SynthesisOutput {
  plan: string[];
  patient_summary: string;
  findings: Finding[];
  questions_for_clinician: string[];
}

const statusValues = new Set<Status>(["flagged", "informational", "red-flag"]);
const severityValues = new Set<Severity>(["major", "moderate", "minor"]);

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["plan", "patient_summary", "findings", "questions_for_clinician"],
  properties: {
    plan: {
      type: "array",
      minItems: 3,
      items: { type: "string", minLength: 1 },
    },
    patient_summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "status",
          "severity",
          "drugs",
          "headline",
          "mechanism",
          "why_this_patient",
          "evidence_ids",
        ],
        properties: {
          status: { type: "string", enum: ["flagged", "informational", "red-flag"] },
          severity: { type: "string", enum: ["major", "moderate", "minor"] },
          drugs: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          headline: { type: "string", minLength: 1 },
          mechanism: { type: "string", minLength: 1 },
          monitoring: { type: "string", minLength: 1 },
          why_this_patient: { type: "string", minLength: 1 },
          evidence_ids: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    questions_for_clinician: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

function buildSystemPrompt(evidenceIds: string[], locale: ReviewLocale): string {
  return [
    "You are the SYNTHESIZE layer for Sourced, a medication-safety tool.",
    "HARD CONTRACT: You may only reason over the provided evidence objects. You may not introduce any interaction, adverse-effect, severity, or monitoring claim not present in the retrieved sources. If you cannot cite an evidence_id for a claim, omit the claim.",
    "The model receives only PatientContext and EvidenceObject array. Do not use outside medical knowledge.",
    "Your jobs are: emit a visible PLAN first, screen each pair against interaction evidence, screen each drug against the patient's labs/allergies/diagnoses, rank findings highest severity first, and contextualize why_this_patient against this patient's context.",
    "Every Finding must have non-empty evidence_ids. Every evidence_id must be one of these ids: " +
      evidenceIds.join(", "),
    "Put source identifiers only in evidence_ids. Do not write evidence ids, source ids, or parenthetical citation tokens inside the patient summary, headline, mechanism, monitoring, why_this_patient, or clinician questions.",
    "Patient medication names, RxCUIs, labs, diagnoses, allergies, and note text are patient context only. They are not clinical evidence for an interaction, adverse effect, therapeutic equivalence, severity, or monitoring claim.",
    "When mentioning a lab, preserve the exact value and reference bounds. Do not call a value top, bottom, high, low, near, or borderline unless that description follows exactly from the supplied bounds.",
    "Use conservative patient-context language. Do not call the context an exact or classic scenario for a source; state only the specific facts that match.",
    "When cited timing makes a current patient value clinically relevant, explain the possible future change with may or could language and never state that the outcome will occur.",
    "Use one uncertainty word, not combinations such as may or could.",
    "Every medication named in why_this_patient must also appear in that finding's drugs array, except a source-stated brand or combination-product container whose declared ingredient is already in finding.drugs. When pair evidence is bound to an ingredient inside a brand product, finding.drugs must contain only the evidence-bound pair; mention the source brand in why_this_patient without adding it as a third interacting drug.",
    "Do not create medication-reconciliation or duplicate-therapy findings unless an EvidenceObject explicitly supports the therapeutic-equivalence claim.",
    "Do not create findings for DDInter Unknown pairs unless another EvidenceObject supports a concrete interaction, adverse effect, severity, or monitoring claim for that pair.",
    "Every DDInter EvidenceObject whose quoted Level is Major, Moderate, or Minor is mandatory pair evidence. Emit at least one Finding that cites that exact evidence_id and contains both subject_drugs in the same drugs array. Never split a supported pair into separate single-drug findings.",
    "For a mandatory DDInter pair, assert only the severity and interaction supported by its exact structured row unless another cited EvidenceObject directly supports a more specific claim for that same pair.",
    "When a CYP-interaction, QT-prolongation, or anticholinergic-burden EvidenceObject is provided for a pair, cite it and state its named mechanism in the finding's mechanism field (e.g. CYP2C9 inhibition raising exposure, additive QT/torsades risk, additive anticholinergic burden) instead of only 'DDInter classifies the pair as X'. Do not add a mechanism beyond what those cited EvidenceObjects state.",
    "A Finding must assert a concrete, supported safety issue. A statement that no interaction or no concrete claim is supported is not a Finding; omit it entirely.",
    "Do not create a drug-drug interaction finding between two agents that are intended combination therapy of the same class (for example basal insulin plus bolus/rapid-acting insulin, or two components of a fixed-dose combination) — co-administering them is standard care, not an interaction. Only flag such a pair if a cited EvidenceObject states a specific interaction between those two agents.",
    "Do not build an interaction finding on a medication the patient is not actually taking concurrently; a drug given only as a one-time diagnostic challenge or that the patient is counseled to avoid is not an active co-medication.",
    "Questions for the clinician must not introduce dosing, monitoring, interaction, adverse-effect, or renal-adjustment claims unsupported by the provided EvidenceObjects.",
    "Do not ask whether to adjust a medication based only on a lab value unless cited evidence explicitly connects that medication, lab, and action.",
    "Questions must not assume their answer. Ask whether duplicate-looking entries are one order or separate orders rather than assuming a single intended order.",
    locale === "es"
      ? "Write patient_summary, headline, mechanism, monitoring, why_this_patient, clinician questions, and plan in clear, plain Spanish. Preserve medication names, evidence ids, quoted source wording, numeric values, and units exactly as provided."
      : "Write patient_summary, headline, mechanism, monitoring, why_this_patient, clinician questions, and plan in clear English. Preserve medication names, evidence ids, quoted source wording, numeric values, and units exactly as provided.",
    "JSON schema: " + JSON.stringify(outputSchema),
    "Return only JSON matching the provided schema. Do not wrap JSON in markdown.",
  ].join("\n");
}

function buildUserPrompt(patient: PatientContext, evidence: EvidenceObject[]): string {
  return JSON.stringify(
    {
      patient,
      evidence,
    },
    null,
    2,
  );
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("synthesize: model did not return JSON");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function asStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    throw new Error(`synthesize: invalid ${field}`);
  }
  return value;
}

function asFinding(value: unknown, index: number): Finding {
  if (typeof value !== "object" || value === null) {
    throw new Error(`synthesize: invalid finding at index ${index}`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !statusValues.has(record.status as Status)) {
    throw new Error(`synthesize: invalid finding status at index ${index}`);
  }
  if (typeof record.severity !== "string" || !severityValues.has(record.severity as Severity)) {
    throw new Error(`synthesize: invalid finding severity at index ${index}`);
  }
  if (
    typeof record.headline !== "string" ||
    typeof record.mechanism !== "string" ||
    typeof record.why_this_patient !== "string"
  ) {
    throw new Error(`synthesize: invalid finding text at index ${index}`);
  }
  const finding: Finding = {
    status: record.status as Status,
    severity: record.severity as Severity,
    drugs: asStringArray(record.drugs, `finding ${index} drugs`),
    headline: record.headline,
    mechanism: record.mechanism,
    why_this_patient: record.why_this_patient,
    evidence_ids: asStringArray(record.evidence_ids, `finding ${index} evidence_ids`),
  };
  if (typeof record.monitoring === "string" && record.monitoring.trim().length > 0) {
    finding.monitoring = record.monitoring;
  }
  return finding;
}

function parseSynthesisOutput(text: string): SynthesisOutput {
  const parsed = parseJsonObject(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("synthesize: model JSON was not an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.patient_summary !== "string" || record.patient_summary.trim().length === 0) {
    throw new Error("synthesize: invalid patient_summary");
  }
  if (!Array.isArray(record.findings)) {
    throw new Error("synthesize: invalid findings");
  }
  return {
    plan: asStringArray(record.plan, "plan"),
    patient_summary: record.patient_summary,
    findings: record.findings.map((finding, index) => asFinding(finding, index)),
    questions_for_clinician: asStringArray(
      record.questions_for_clinician,
      "questions_for_clinician",
    ),
  };
}

function printPlan(plan: string[]): void {
  console.error("PLAN");
  for (let i = 0; i < plan.length; i++) {
    console.error(`${i + 1}. ${plan[i]}`);
  }
}

function normalizedDrug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function drugMatches(candidate: string, subject: string): boolean {
  const normalizedCandidate = normalizedDrug(candidate);
  const normalizedSubject = normalizedDrug(subject);
  if (!normalizedCandidate || !normalizedSubject) return false;
  return normalizedCandidate === normalizedSubject ||
    normalizedCandidate.includes(normalizedSubject) ||
    normalizedSubject.includes(normalizedCandidate);
}

function concretePairEvidence(evidence: EvidenceObject): boolean {
  return evidence.source_name === "DDInter" &&
    evidence.subject_drugs?.length === 2 &&
    typeof evidence.quoted_text === "string" &&
    /Level:\s*(Major|Moderate|Minor)\b/i.test(evidence.quoted_text);
}

export function missingRequiredPairEvidence(
  findings: Finding[],
  evidence: EvidenceObject[],
): EvidenceObject[] {
  return evidence.filter((item) => {
    if (!concretePairEvidence(item)) return false;
    const subjects = item.subject_drugs ?? [];
    return !findings.some((finding) =>
      finding.evidence_ids.includes(item.id) &&
      subjects.every((subject) => finding.drugs.some((drug) => drugMatches(drug, subject)))
    );
  });
}

function pairLevel(evidence: EvidenceObject): "Major" | "Moderate" | "Minor" {
  const level = evidence.quoted_text?.match(/Level:\s*(Major|Moderate|Minor)\b/i)?.[1];
  if (!level) throw new Error(`synthesize: DDInter evidence ${evidence.id} is missing a concrete level`);
  return `${level[0]?.toUpperCase()}${level.slice(1).toLowerCase()}` as "Major" | "Moderate" | "Minor";
}

export function canonicalizeRequiredPairFindings(
  findings: Finding[],
  evidence: EvidenceObject[],
  locale: ReviewLocale = "en",
): Finding[] {
  const required = evidence.filter(concretePairEvidence).sort((left, right) => {
    const leftIndex = findings.findIndex((finding) => finding.evidence_ids.includes(left.id));
    const rightIndex = findings.findIndex((finding) => finding.evidence_ids.includes(right.id));
    return leftIndex - rightIndex;
  });
  if (required.length === 0) return findings;
  const requiredIds = new Set(required.map((item) => item.id));
  const firstRequiredIndex = findings.findIndex((finding) =>
    finding.evidence_ids.some((id) => requiredIds.has(id))
  );
  const insertionIndex = findings.slice(0, Math.max(0, firstRequiredIndex)).filter((finding) =>
    !finding.evidence_ids.some((id) => requiredIds.has(id))
  ).length;
  const retained = findings.filter((finding) =>
    !finding.evidence_ids.some((id) => requiredIds.has(id))
  );
  const canonical = required.map((item): Finding => {
    const [left, right] = item.subject_drugs as [string, string];
    const level = pairLevel(item);
    return {
      status: level === "Major" ? "red-flag" : level === "Moderate" ? "flagged" : "informational",
      severity: level.toLowerCase() as Severity,
      drugs: [left, right],
      headline: locale === "es" ? `Interacción entre ${left} y ${right}` : `${left} + ${right} interaction`,
      mechanism: locale === "es"
        ? `DDInter clasifica el par exacto ${left} + ${right} con gravedad ${level === "Major" ? "mayor" : level === "Moderate" ? "moderada" : "menor"}.`
        : `DDInter classifies the exact ${left} + ${right} pair as ${level}.`,
      why_this_patient: locale === "es"
        ? `Tanto ${left} como ${right} están activos en el episodio de seguridad de medicamentos revisado.`
        : `Both ${left} and ${right} are active in the reviewed medication-safety episode.`,
      evidence_ids: [item.id],
    };
  });
  return [
    ...retained.slice(0, insertionIndex),
    ...canonical,
    ...retained.slice(insertionIndex),
  ];
}

export function constrainPatientReasoning(
  findings: Finding[],
  patient: PatientContext,
  locale: ReviewLocale = "en",
): Finding[] {
  const activeMedications = patient.medications.filter(
    (medication) => (medication.status ?? "active") === "active",
  );
  return findings.map((finding) => {
    const normalizedReasoning = ` ${normalizedDrug(finding.why_this_patient)} `;
    const referencesOutsideMedication = activeMedications.some((medication) => {
      const names = [
        medication.name,
        ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? []),
      ];
      if (names.some((name) => finding.drugs.some((drug) => drugMatches(drug, name)))) {
        return false;
      }
      return names.some((name) => {
        const normalizedName = normalizedDrug(name);
        return normalizedName.length >= 4 && normalizedReasoning.includes(` ${normalizedName} `);
      });
    });
    return referencesOutsideMedication
      ? {
          ...finding,
          why_this_patient: locale === "es"
            ? "Los medicamentos de este hallazgo están activos en el episodio de seguridad de medicamentos revisado."
            : "The medications in this finding are active in the reviewed medication-safety episode.",
        }
      : finding;
  });
}

export function canonicalizeExplicitClassPairs(
  findings: Finding[],
  evidence: EvidenceObject[],
  patient: PatientContext,
  locale: ReviewLocale = "en",
): Finding[] {
  const spironolactoneEvidence = evidence.find((item) =>
    item.source_name === "openFDA-label" &&
    drugMatches(item.anchor_drug ?? "", "spironolactone") &&
    /ACE inhibitors/i.test(item.quoted_text ?? "") &&
    /severe hyperkalemia/i.test(item.quoted_text ?? "")
  );
  if (!spironolactoneEvidence) return findings;
  const active = patient.medications.filter(
    (medication) => (medication.status ?? "active") === "active",
  );
  const spironolactoneActive = active.some((medication) =>
    [
      medication.name,
      ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? []),
    ].some((name) => drugMatches(name, "spironolactone"))
  );
  let aceClassEvidence: EvidenceObject | undefined;
  const aceInhibitor = active.find((medication) => {
    if (drugMatches(medication.name, "spironolactone")) return false;
    const escapedName = medication.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const structuredClassEvidence = evidence.find((item) =>
      item.source_name === "openFDA-label" &&
      drugMatches(item.anchor_drug ?? "", medication.name) &&
      /ACE inhibitors/i.test(item.quoted_text ?? "") &&
      new RegExp(`\\b${escapedName}\\b`, "i").test(item.quoted_text ?? "")
    );
    const noteDeclaresClass = new RegExp(
      `(?:${escapedName}.{0,100}ACE inhibitor|ACE inhibitor.{0,100}${escapedName})`,
      "i",
    ).test(patient.note ?? "");
    const declaredInMedication = /\bACE inhibitor\b/i.test(
      `${medication.raw} ${medication.episode ?? ""} ${medication.start ?? ""} ${medication.end ?? ""} ${medication.source_span ?? ""}`,
    );
    if (structuredClassEvidence) aceClassEvidence = structuredClassEvidence;
    return Boolean(structuredClassEvidence) || declaredInMedication || noteDeclaresClass;
  });
  if (!spironolactoneActive || !aceInhibitor) return findings;
  const pair = [spironolactoneEvidence.anchor_drug ?? "spironolactone", aceInhibitor.name];
  const retained = findings.filter((finding) =>
    !pair.every((subject) => finding.drugs.some((drug) => drugMatches(drug, subject)))
  );
  const canonical: Finding = {
    status: "red-flag",
    severity: "major",
    drugs: pair,
    headline: locale === "es"
      ? `${pair[0]} + ${pair[1]} puede causar hiperpotasemia grave`
      : `${pair[0]} + ${pair[1]} may lead to severe hyperkalemia`,
    mechanism: locale === "es"
      ? "La etiqueta de spironolactone incluye los inhibidores de la ECA entre los fármacos que aumentan el potasio y señala que su administración concomitante puede causar hiperpotasemia grave."
      : "The spironolactone label lists ACE inhibitors among drugs that increase potassium and states that concomitant administration may lead to severe hyperkalemia.",
    why_this_patient: locale === "es"
      ? `Tanto ${pair[0]} como ${pair[1]} están activos en el episodio revisado, y la fuente identifica ${pair[1]} como inhibidor de la ECA.`
      : `Both ${pair[0]} and ${pair[1]} are active in the reviewed medication-safety episode, and the source identifies ${pair[1]} as an ACE inhibitor.`,
    evidence_ids: [
      spironolactoneEvidence.id,
      ...(aceClassEvidence ? [aceClassEvidence.id] : []),
    ],
  };
  return [canonical, ...retained];
}

export async function synthesize(
  patient: PatientContext,
  evidence: EvidenceObject[],
  now: string,
  locale: ReviewLocale = "en",
): Promise<SafetyReport> {
  const systemPrompt = buildSystemPrompt(evidence.map((item) => item.id), locale);
  const userPrompt = buildUserPrompt(patient, evidence);

  let rawOutput = await callOpus(systemPrompt, userPrompt, outputSchema);
  let output = parseSynthesisOutput(rawOutput);
  let missingPairs = missingRequiredPairEvidence(output.findings, evidence);
  if (missingPairs.length > 0) {
    const requirements = missingPairs.map((item) => ({
      evidence_id: item.id,
      subject_drugs: item.subject_drugs,
      quoted_text: item.quoted_text,
    }));
    rawOutput = await callOpus(
      `${systemPrompt}\nThe previous synthesis violated the mandatory DDInter pair contract. Repair every listed pair in one joint Finding and return the complete report JSON again.`,
      JSON.stringify({ patient, evidence, previous_output: output, missing_mandatory_pairs: requirements }, null, 2),
      outputSchema,
    );
    output = parseSynthesisOutput(rawOutput);
    missingPairs = missingRequiredPairEvidence(output.findings, evidence);
    if (missingPairs.length > 0) {
      throw new Error(
        `synthesize: missing mandatory DDInter pair findings: ${missingPairs.map((item) => item.subject_drugs?.join(" + ")).join(", ")}`,
      );
    }
  }
  output = {
    ...output,
    findings: constrainPatientReasoning(
      canonicalizeExplicitClassPairs(
        canonicalizeRequiredPairFindings(output.findings, evidence, locale),
        evidence,
        patient,
        locale,
      ),
      patient,
      locale,
    ),
  };
  printPlan(output.plan);

  return {
    patient,
    patient_summary: output.patient_summary,
    findings: output.findings,
    questions_for_clinician: output.questions_for_clinician,
    evidence,
    unverified_removed: [],
    generated_at: now,
  };
}
