import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Builds a strong Spanish golden review by translating only the narrative of
 * the vetted English golden (report.json), keeping every evidence binding,
 * drug name, dose, unit, number, and evidence_id identical. The synthesis
 * pipeline is inconsistent at binding the FDA mechanism for warfarin +
 * amiodarone, so the golden must not be re-synthesized per locale.
 */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(resolve(webRoot, "public/data/report.json"), "utf8"));

const narrativeSchema = z.object({
  patient_summary: z.string(),
  findings: z.array(z.object({
    headline: z.string(),
    mechanism: z.string(),
    monitoring: z.string(),
    why_this_patient: z.string(),
  })),
  questions_for_clinician: z.array(z.string()),
});

const narrative = {
  patient_summary: source.patient_summary,
  findings: source.findings.map((f: { headline: string; mechanism: string; monitoring: string; why_this_patient: string }) => ({
    headline: f.headline,
    mechanism: f.mechanism,
    monitoring: f.monitoring,
    why_this_patient: f.why_this_patient,
  })),
  questions_for_clinician: source.questions_for_clinician,
};

const { object } = await generateObject({
  model: "anthropic/claude-opus-4.8",
  schema: narrativeSchema,
  system: "You are a clinical translator. Translate the provided medication-safety narrative from English to natural, professional clinical Spanish. Preserve every medication name, dose, unit, lab value, number, and INR exactly as written. Do not add, remove, or reinterpret any clinical claim. Keep the same array lengths and order. Use correct Spanish orthography with all accents (á, é, í, ó, ú, ñ) and inverted punctuation (¿ ¡).",
  prompt: JSON.stringify(narrative),
});

if (object.findings.length !== source.findings.length || object.questions_for_clinician.length !== source.questions_for_clinician.length) {
  throw new Error("Translation changed array lengths; refusing to write.");
}

const now = new Date().toISOString();
const report = {
  ...source,
  generated_at: now,
  patient_summary: object.patient_summary,
  pipeline: { ...source.pipeline, mode: "audited-replay" },
  findings: source.findings.map((f: Record<string, unknown>, index: number) => ({
    ...f,
    headline: object.findings[index]!.headline,
    mechanism: object.findings[index]!.mechanism,
    monitoring: object.findings[index]!.monitoring,
    why_this_patient: object.findings[index]!.why_this_patient,
  })),
  questions_for_clinician: object.questions_for_clinician,
};

// Structure parity: evidence and evidence_ids must be byte-identical to the EN golden.
const enIds = JSON.stringify(source.findings.map((f: { evidence_ids: string[] }) => f.evidence_ids));
const esIds = JSON.stringify(report.findings.map((f: { evidence_ids: string[] }) => f.evidence_ids));
if (enIds !== esIds) throw new Error("Evidence binding drifted during localization.");

writeFileSync(
  resolve(webRoot, "public/data/reviews/golden.es.json"),
  `${JSON.stringify({ id: "golden", locale: "es", intake: null, report, generatedAt: now }, null, 2)}\n`,
);
console.log(`golden.es localized: ${report.findings.length} findings, ${report.evidence.length} evidence, bindings preserved.`);
