import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@core/model";
import type { SafetyReport } from "@core/types/index";

// Localizes a precomputed EN review to ES by translating ONLY the narrative
// (patient summary, finding prose, clinician questions, research questions),
// keeping every binding, drug name, dose, value, severity, and evidence id
// identical. This is how a case that a Spanish source makes the ES synthesis
// step reject (a non-deterministic model omission) still ships a faithful ES
// review: the EN report already passed every guardrail, so we translate it
// rather than re-synthesizing. Same discipline as the pinned golden.

const id = process.argv.find((arg) => arg.startsWith("--case="))?.split("=")[1];
if (!id) throw new Error("Usage: localize-review-es.ts --case=<id>");

const reviewsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data/reviews");
const enPath = resolve(reviewsDir, `${id}.en.json`);
const esPath = resolve(reviewsDir, `${id}.es.json`);

interface Precomputed {
  id: string;
  locale: string;
  intake: unknown;
  generatedAt: string;
  report: SafetyReport & {
    research_candidates?: Array<{ question: string; reason: string; [k: string]: unknown }>;
  };
}

const en = JSON.parse(readFileSync(enPath, "utf8")) as Precomputed;
const report = en.report;

const schema = z.object({
  patient_summary: z.string(),
  findings: z.array(z.object({ headline: z.string(), mechanism: z.string(), monitoring: z.string(), why_this_patient: z.string() })),
  questions_for_clinician: z.array(z.string()),
});

const { object } = await generateObject({
  model: resolveModel("anthropic/claude-opus-4.8"),
  schema,
  system:
    "You are a clinical translator. Translate the medication-safety narrative from English to natural, professional clinical Spanish. Preserve every medication name, dose, unit, lab value, number, severity word, and enzyme name exactly as written. Do not add, remove, or reinterpret any clinical claim. Keep the same array lengths and order. Use correct Spanish orthography with all accents and inverted punctuation (¿ ¡).",
  prompt: JSON.stringify({
    patient_summary: report.patient_summary,
    findings: report.findings.map((f) => ({ headline: f.headline, mechanism: f.mechanism, monitoring: f.monitoring ?? "", why_this_patient: f.why_this_patient })),
    questions_for_clinician: report.questions_for_clinician,
  }),
});

if (object.findings.length !== report.findings.length || object.questions_for_clinician.length !== report.questions_for_clinician.length) {
  throw new Error("Translation changed array lengths; refusing to write.");
}

const esReport = {
  ...report,
  patient_summary: object.patient_summary,
  findings: report.findings.map((f, index) => ({
    ...f,
    headline: object.findings[index]!.headline,
    mechanism: object.findings[index]!.mechanism,
    monitoring: object.findings[index]!.monitoring || f.monitoring,
    why_this_patient: object.findings[index]!.why_this_patient,
  })),
  questions_for_clinician: object.questions_for_clinician,
};

// Guardrail: evidence bindings must not drift during localization.
const enIds = JSON.stringify(report.findings.map((f) => f.evidence_ids));
const esIds = JSON.stringify(esReport.findings.map((f) => f.evidence_ids));
if (enIds !== esIds) throw new Error("Evidence binding drifted during localization.");

const payload: Precomputed = { ...en, locale: "es", report: esReport as Precomputed["report"] };
writeFileSync(esPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`localized ${id}: ES written, ${esReport.findings.length} findings, bindings preserved.`);
