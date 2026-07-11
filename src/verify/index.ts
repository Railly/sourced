import { callOpus, parseJsonObject } from "../llm.ts";
import type { EvidenceObject, Finding, PatientContext, ReviewLocale, SafetyReport } from "../types/index.ts";

function localized(locale: ReviewLocale, english: string, spanish: string): string {
  return locale === "es" ? spanish : english;
}

function findingClaimText(finding: Finding): string {
  return finding.headline || finding.mechanism || finding.drugs.join(" + ") || "untitled finding";
}

// ---- Level 1: deterministic citation resolution ----

interface Level1Result {
  survivors: Finding[];
  removed: SafetyReport["unverified_removed"];
}

function medicationComponents(name: string): string[] {
  return name
    .toLowerCase()
    .split("/")
    .map((component) => component.trim())
    .filter(Boolean);
}

function mentionsMedication(text: string, medication: string): boolean {
  const escaped = medication.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
}

function normalizedMedicationName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function medicationNameMatches(left: string, right: string): boolean {
  const normalizedLeft = normalizedMedicationName(left);
  const normalizedRight = normalizedMedicationName(right);
  if (normalizedLeft === normalizedRight) return Boolean(normalizedLeft);
  if (Math.min(normalizedLeft.length, normalizedRight.length) < 5) return false;
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)),
  );
}

function evidenceBindingFailure(
  finding: Finding,
  citedEvidence: EvidenceObject[],
  locale: ReviewLocale,
): string | undefined {
  for (const evidence of citedEvidence) {
    if (
      evidence.supporting_text &&
      (!evidence.quoted_text || !evidence.quoted_text.includes(evidence.supporting_text)) &&
      evidence.source_name !== "DDInter" &&
      evidence.source_name !== "openFDA-FAERS"
    ) {
      return localized(locale, `Evidence ${evidence.id} exposes supporting text that is not present in its quoted source field.`, `La evidencia ${evidence.id} expone texto de respaldo que no está presente en el campo citado de la fuente.`);
    }
    if (
      evidence.anchor_drug &&
      !finding.drugs.some((drug) => medicationNameMatches(drug, evidence.anchor_drug!))
    ) {
      return localized(locale, `Evidence ${evidence.id} is anchored to ${evidence.anchor_drug}, outside finding.drugs.`, `La evidencia ${evidence.id} está anclada a ${evidence.anchor_drug}, fuera de finding.drugs.`);
    }
  }

  const ddinterEvidence = citedEvidence.filter((evidence) => evidence.source_name === "DDInter");
  if (ddinterEvidence.length === 0) return undefined;
  const subjects = ddinterEvidence.flatMap((evidence) => evidence.subject_drugs ?? []);
  if (ddinterEvidence.some((evidence) => evidence.subject_drugs?.length !== 2)) {
    return localized(locale, "DDInter evidence is missing its exact two-drug subject binding.", "La evidencia de DDInter no contiene la vinculación exacta con los dos medicamentos.");
  }
  const outside = subjects.filter(
    (subject) => !finding.drugs.some((drug) => medicationNameMatches(drug, subject)),
  );
  if (outside.length > 0) {
    return localized(locale, `DDInter evidence is bound to medication(s) outside finding.drugs: ${[...new Set(outside)].join(", ")}.`, `La evidencia de DDInter está vinculada a medicamentos fuera de finding.drugs: ${[...new Set(outside)].join(", ")}.`);
  }
  const uncovered = finding.drugs.filter(
    (drug) => !subjects.some((subject) => medicationNameMatches(drug, subject)),
  );
  if (uncovered.length > 0) {
    return localized(locale, `DDInter evidence does not cover finding medication(s): ${uncovered.join(", ")}.`, `La evidencia de DDInter no cubre los medicamentos del hallazgo: ${uncovered.join(", ")}.`);
  }
  return undefined;
}

function level1(
  report: SafetyReport,
  evidence: EvidenceObject[],
  patient: PatientContext | undefined,
  locale: ReviewLocale,
): Level1Result {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const survivors: Finding[] = [];
  const removed: SafetyReport["unverified_removed"] = [...report.unverified_removed];

  for (const finding of report.findings) {
    if (finding.evidence_ids.length === 0) {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: localized(locale, "Finding has no evidence_ids.", "El hallazgo no tiene evidence_ids."),
      });
      continue;
    }
    const missing = finding.evidence_ids.filter((id) => !evidenceById.has(id));
    if (missing.length > 0) {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: localized(locale, `Unresolved evidence_id(s): ${missing.join(", ")}.`, `evidence_id sin resolver: ${missing.join(", ")}.`),
      });
      continue;
    }
    const citedEvidence = finding.evidence_ids.flatMap((id) => {
      const item = evidenceById.get(id);
      return item ? [item] : [];
    });
    const bindingFailure = evidenceBindingFailure(finding, citedEvidence, locale);
    if (bindingFailure) {
      removed.push({ claim_text: findingClaimText(finding), reason: bindingFailure });
      continue;
    }
    if (patient) {
      const activeMedicationNames = patient.medications
        .filter((medication) => (medication.status ?? "active") === "active")
        .flatMap((medication) => [
          medication.name,
          ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? []),
        ]);
      const inactiveFindingDrugs = finding.drugs.filter(
        (drug) => !activeMedicationNames.some((name) => medicationNameMatches(drug, name)),
      );
      if (inactiveFindingDrugs.length > 0) {
        removed.push({
          claim_text: findingClaimText(finding),
          reason: localized(locale, `Finding references unresolved or non-active medication(s): ${inactiveFindingDrugs.join(", ")}.`, `El hallazgo menciona medicamentos no resueltos o inactivos: ${inactiveFindingDrugs.join(", ")}.`),
        });
        continue;
      }
      const findingDrugs = new Set(finding.drugs.flatMap(medicationComponents));
      if (
        findingDrugs.size === 1 &&
        /\b(?:two|2|multiple|other|interacting|concurrent|newly started)\b[^.]{0,40}\b(?:drugs|medications|agents)\b/i.test(
          finding.why_this_patient,
        )
      ) {
        removed.push({
          claim_text: findingClaimText(finding),
          reason: localized(locale, "Patient-specific reasoning imports plural medication context into a single-drug finding.", "El razonamiento específico del paciente incorpora varios medicamentos en un hallazgo de un solo medicamento."),
        });
        continue;
      }
      const outsideScope = [
        ...new Set(
          patient.medications
            .filter((medication) => (medication.status ?? "active") === "active")
            .flatMap((medication) => {
              const names = [
                medication.name,
                ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? []),
              ];
              const represented = names.some((name) =>
                finding.drugs.some((drug) => medicationNameMatches(drug, name)),
              );
              if (represented) return [];
              return medicationComponents(medication.name).filter((name) =>
                mentionsMedication(finding.why_this_patient, name),
              );
            }),
        ),
      ];
      if (outsideScope.length > 0) {
        removed.push({
          claim_text: findingClaimText(finding),
          reason: localized(locale, `Patient-specific reasoning references medication(s) outside finding.drugs: ${outsideScope.join(", ")}.`, `El razonamiento específico del paciente menciona medicamentos fuera de finding.drugs: ${outsideScope.join(", ")}.`),
        });
        continue;
      }
    }
    survivors.push({
      ...finding,
      evidence_ids: [...new Set(finding.evidence_ids)],
    });
  }
  return { survivors, removed };
}

// ---- Level 2: adversarial claim-vs-source review ----
// This is the reviewer agent. It catches the real, dangerous failure: a finding
// that cites a valid evidence object but asserts something that object does not say.

const level2Schema = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "unsupported_claims"],
  properties: {
    supported: { type: "boolean" },
    unsupported_claims: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const LEVEL2_SYSTEM = [
  "You are the adversarial VERIFIER for Sourced, a medication-safety tool.",
  "You are given ONE finding, the exact patient context, and the verbatim quoted text of the sources it cites.",
  "Your only job: decide whether EVERY clinical assertion in the finding (severity, mechanism, interaction, monitoring action, dose change, adverse effect, and patient-specific reasoning) is directly supported.",
  "Patient-specific facts must appear in the patient context. Drug facts, severity, numbers, and monitoring instructions must appear in or be directly entailed by the quoted source text.",
  "Do NOT use outside medical knowledge. If a claim is medically true but NOT present in the quoted text, it is UNSUPPORTED.",
  "Be strict: a specific number, dose, severity level, or monitoring instruction must appear in or be directly entailed by the quoted text.",
  "Severity mapping policy: quoted severe or life-threatening harm directly entails major severity. Do not reject only because the source says severe rather than major. No other severity escalation is allowed.",
  "Check arithmetic and comparisons. Reject qualitative numeric descriptions such as top, bottom, high, low, near, or borderline unless they follow exactly from the supplied value and bounds.",
  "A rendered Finding must assert a concrete safety issue. If it only says no interaction or no concrete claim is supported, reject it as a non-finding.",
  "Patient context may prove that medications were started, but it cannot prove that unnamed or out-of-scope medications interact. Reject plural medication context in a single-drug finding unless those medications are declared in finding.drugs and supported by the cited sources.",
  "Return supported=true only if nothing in the finding goes beyond the sources. List every unsupported assertion in unsupported_claims.",
  "Return only JSON matching the schema. No markdown.",
].join("\n");

export interface Level2Verdict {
  supported: boolean;
  unsupported_claims: string[];
}

export interface NarrativeVerdict {
  summary_supported: boolean;
  unsupported_summary_claims: string[];
  supported_question_indexes: number[];
  unsupported_questions: Array<{ index: number; unsupported_claims: string[] }>;
}

const narrativeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary_supported",
    "unsupported_summary_claims",
    "supported_question_indexes",
    "unsupported_questions",
  ],
  properties: {
    summary_supported: { type: "boolean" },
    unsupported_summary_claims: { type: "array", items: { type: "string" } },
    supported_question_indexes: { type: "array", items: { type: "integer" } },
    unsupported_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "unsupported_claims"],
        properties: {
          index: { type: "integer" },
          unsupported_claims: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const NARRATIVE_SYSTEM = [
  "You are the final narrative VERIFIER for Sourced, a medication-safety tool.",
  "Verify the patient summary and each clinician question against the exact patient context and quoted evidence.",
  "Patient facts must appear in or be directly entailed by the patient context. Clinical facts and premises must appear in or be directly entailed by quoted evidence.",
  "Do not use outside medical knowledge. A question can still contain an unsupported premise.",
  "A question may request information that is absent from the context; the missing answer is why it is being asked. Verify only its factual premises and whether any requested clinical action is supported.",
  "A question asking about a dose or plan adjustment asserts that the action is relevant and requires quoted evidence explicitly connecting the medication, patient fact, and action.",
  "Check arithmetic and comparisons. Reject qualitative numeric descriptions unless they follow exactly from supplied values and bounds.",
  "Return the zero-based indexes of only fully supported questions. List every unsupported assertion.",
  "Return only JSON matching the schema. No markdown.",
].join("\n");

function buildLevel2User(
  finding: Finding,
  evidence: EvidenceObject[],
  patient: PatientContext | undefined,
): string {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const citedSources = finding.evidence_ids.map((id) => {
    const e = evidenceById.get(id);
    return {
      evidence_id: id,
      source: e?.source_name,
      claim_text: e?.claim_text,
      exact_field: e?.exact_field,
      subject_drugs: e?.subject_drugs,
      anchor_drug: e?.anchor_drug,
      quoted_text: e?.quoted_text ?? "(no quoted text on this evidence object)",
      supporting_text: e?.supporting_text,
      retrieval_query: e?.retrieval_query,
    };
  });
  return JSON.stringify(
    {
      patient_context: patient ?? null,
      finding: {
        headline: finding.headline,
        severity: finding.severity,
        mechanism: finding.mechanism,
        monitoring: finding.monitoring ?? null,
        why_this_patient: finding.why_this_patient,
        drugs: finding.drugs,
      },
      cited_sources: citedSources,
    },
    null,
    2,
  );
}

async function level2Check(
  finding: Finding,
  evidence: EvidenceObject[],
  patient: PatientContext | undefined,
  locale: ReviewLocale = "en",
): Promise<Level2Verdict> {
  const raw = await callOpus(
    `${LEVEL2_SYSTEM}\n${locale === "es" ? "The finding may be written in Spanish. Evaluate it against the unchanged source evidence and return unsupported_claims in clear Spanish." : "Return unsupported_claims in clear English."}`,
    buildLevel2User(finding, evidence, patient),
    level2Schema,
  );
  const parsed = parseJsonObject(raw) as Record<string, unknown>;
  const supported = parsed.supported === true;
  const unsupported = Array.isArray(parsed.unsupported_claims)
    ? parsed.unsupported_claims.filter((c): c is string => typeof c === "string")
    : [];
  return { supported, unsupported_claims: unsupported };
}

async function narrativeCheck(
  report: SafetyReport,
  evidence: EvidenceObject[],
  patient: PatientContext,
  locale: ReviewLocale = "en",
): Promise<NarrativeVerdict> {
  const raw = await callOpus(
    `${NARRATIVE_SYSTEM}\n${locale === "es" ? "The narrative may be written in Spanish. Evaluate it against the unchanged source evidence and return unsupported claims in clear Spanish." : "Return unsupported claims in clear English."}`,
    JSON.stringify(
      {
        patient_context: patient,
        patient_summary: report.patient_summary,
        questions_for_clinician: report.questions_for_clinician,
        evidence: evidence.map((item) => ({
          evidence_id: item.id,
          source: item.source_name,
          quoted_text: item.quoted_text ?? "(no quoted text on this evidence object)",
        })),
      },
      null,
      2,
    ),
    narrativeSchema,
  );
  const parsed = parseJsonObject(raw) as Record<string, unknown>;
  const unsupportedQuestions = Array.isArray(parsed.unsupported_questions)
    ? parsed.unsupported_questions.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const record = item as Record<string, unknown>;
        if (typeof record.index !== "number" || !Array.isArray(record.unsupported_claims))
          return [];
        return [
          {
            index: record.index,
            unsupported_claims: record.unsupported_claims.filter(
              (claim): claim is string => typeof claim === "string",
            ),
          },
        ];
      })
    : [];
  return {
    summary_supported: parsed.summary_supported === true,
    unsupported_summary_claims: Array.isArray(parsed.unsupported_summary_claims)
      ? parsed.unsupported_summary_claims.filter(
          (claim): claim is string => typeof claim === "string",
        )
      : [],
    supported_question_indexes: Array.isArray(parsed.supported_question_indexes)
      ? parsed.supported_question_indexes.filter(
          (index): index is number => Number.isInteger(index) && index >= 0,
        )
      : [],
    unsupported_questions: unsupportedQuestions,
  };
}

export interface VerifyOptions {
  /** Run the adversarial claim-vs-source pass. Default true. */
  adversarial?: boolean;
  patient?: PatientContext;
  narrative?: boolean;
  locale?: ReviewLocale;
  reviewer?: (
    finding: Finding,
    evidence: EvidenceObject[],
    patient: PatientContext | undefined,
  ) => Promise<Level2Verdict>;
  narrativeReviewer?: (
    report: SafetyReport,
    evidence: EvidenceObject[],
    patient: PatientContext,
  ) => Promise<NarrativeVerdict>;
}

export async function verify(
  report: SafetyReport,
  evidence: EvidenceObject[],
  options: VerifyOptions = {},
): Promise<SafetyReport> {
  const adversarial = options.adversarial ?? true;
  const locale = options.locale ?? "en";
  const reviewer = options.reviewer ?? ((finding, citedEvidence, patient) => level2Check(finding, citedEvidence, patient, locale));
  const narrativeReviewer = options.narrativeReviewer ?? ((candidate, citedEvidence, patient) => narrativeCheck(candidate, citedEvidence, patient, locale));
  const { survivors, removed } = level1(report, evidence, options.patient, locale);

  if (!adversarial) {
    return {
      ...report,
      findings: survivors,
      evidence,
      unverified_removed: removed,
    };
  }

  const findings: Finding[] = [];
  for (const finding of survivors) {
    let verdict: Level2Verdict;
    try {
      verdict = await reviewer(finding, evidence, options.patient);
    } catch {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: localized(locale, "Adversarial reviewer unavailable; finding was not rendered because claim-vs-source verification did not complete.", "El revisor adversarial no estuvo disponible. El hallazgo no se mostró porque no terminó la verificación contra la fuente."),
      });
      continue;
    }
    if (verdict.supported && verdict.unsupported_claims.length === 0) {
      findings.push(finding);
    } else {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: localized(locale, `Reviewer: claim not supported by cited sources: ${verdict.unsupported_claims.join("; ")}`, `Revisor: la afirmación no está respaldada por las fuentes citadas: ${verdict.unsupported_claims.join("; ")}`),
      });
    }
  }

  let patientSummary = report.patient_summary;
  let questions = report.questions_for_clinician;
  const verifyNarrative = options.narrative ?? options.patient !== undefined;
  if (verifyNarrative) {
    if (!options.patient) {
      patientSummary = localized(locale, "Patient context unavailable. Only verified findings are shown.", "El contexto del paciente no está disponible. Solo se muestran hallazgos verificados.");
      questions = [];
      removed.push({
        claim_text: "Patient summary and clinician questions",
        reason: localized(locale, "Narrative verification requires the exact patient context.", "La verificación narrativa requiere el contexto exacto del paciente."),
      });
    } else {
      try {
        const verdict = await narrativeReviewer(report, evidence, options.patient);
        if (!verdict.summary_supported || verdict.unsupported_summary_claims.length > 0) {
          removed.push({
            claim_text: report.patient_summary,
            reason: localized(locale, `Narrative reviewer: ${verdict.unsupported_summary_claims.join("; ") || "summary not fully supported"}`, `Revisor narrativo: ${verdict.unsupported_summary_claims.join("; ") || "el resumen no está completamente respaldado"}`),
          });
          patientSummary = localized(locale, "Patient context received. Only verified findings are shown.", "Contexto del paciente recibido. Solo se muestran hallazgos verificados.");
        }
        const unsupportedIndexes = new Set(verdict.unsupported_questions.map((item) => item.index));
        const supportedIndexes = new Set(
          verdict.supported_question_indexes.filter((index) => !unsupportedIndexes.has(index)),
        );
        questions = report.questions_for_clinician.filter((question, index) => {
          if (supportedIndexes.has(index)) return true;
          const unsupported = verdict.unsupported_questions.find((item) => item.index === index);
          removed.push({
            claim_text: question,
            reason: localized(locale, `Narrative reviewer: ${unsupported?.unsupported_claims.join("; ") || "question not fully supported"}`, `Revisor narrativo: ${unsupported?.unsupported_claims.join("; ") || "la pregunta no está completamente respaldada"}`),
          });
          return false;
        });
      } catch {
        patientSummary = localized(locale, "Patient context received. Only verified findings are shown.", "Contexto del paciente recibido. Solo se muestran hallazgos verificados.");
        questions = [];
        removed.push({
          claim_text: "Patient summary and clinician questions",
          reason: localized(locale, "Narrative reviewer unavailable; narrative claims were not rendered because verification did not complete.", "El revisor narrativo no estuvo disponible. Las afirmaciones narrativas no se mostraron porque la verificación no terminó."),
        });
      }
    }
  }

  return {
    ...report,
    patient_summary: patientSummary,
    findings,
    questions_for_clinician: questions,
    evidence,
    unverified_removed: removed,
  };
}
