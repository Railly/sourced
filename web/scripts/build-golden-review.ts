import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Regenerates the pinned golden review (EN + ES) from the vetted, mechanism-rich
 * report.json. The synthesis pipeline is inconsistent at binding the FDA CYP2C9
 * mechanism for warfarin + amiodarone, so the on-camera golden is never
 * re-synthesized: EN is the vetted report verbatim, ES is a narrative-only
 * translation that preserves every evidence binding, drug, dose, and number.
 */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewsDir = resolve(webRoot, "public/data/reviews");
const source = JSON.parse(readFileSync(resolve(webRoot, "public/data/report.json"), "utf8"));

function auditedReplay(report: Record<string, unknown>, now: string): Record<string, unknown> {
  return { ...report, generated_at: now, pipeline: { ...(report.pipeline as object), mode: "audited-replay" } };
}

function write(locale: "en" | "es", report: Record<string, unknown>, now: string): void {
  writeFileSync(
    resolve(reviewsDir, `golden.${locale}.json`),
    `${JSON.stringify({ id: "golden", locale, intake: null, report, generatedAt: now }, null, 2)}\n`,
  );
}

const now = new Date().toISOString();

// EN: the vetted report verbatim.
write("en", auditedReplay(source, now), now);

// ES: translate only the narrative, keep every binding and value identical.
const narrativeSchema = z.object({
  patient_summary: z.string(),
  findings: z.array(z.object({ headline: z.string(), mechanism: z.string(), monitoring: z.string(), why_this_patient: z.string() })),
  questions_for_clinician: z.array(z.string()),
});

const { object } = await generateObject({
  model: "anthropic/claude-opus-4.8",
  schema: narrativeSchema,
  system: "You are a clinical translator. Translate the provided medication-safety narrative from English to natural, professional clinical Spanish. Preserve every medication name, dose, unit, lab value, number, and INR exactly as written. Do not add, remove, or reinterpret any clinical claim. Keep the same array lengths and order. Use correct Spanish orthography with all accents (á, é, í, ó, ú, ñ) and inverted punctuation (¿ ¡).",
  prompt: JSON.stringify({
    patient_summary: source.patient_summary,
    findings: source.findings.map((f: { headline: string; mechanism: string; monitoring: string; why_this_patient: string }) => ({ headline: f.headline, mechanism: f.mechanism, monitoring: f.monitoring, why_this_patient: f.why_this_patient })),
    questions_for_clinician: source.questions_for_clinician,
  }),
});

if (object.findings.length !== source.findings.length || object.questions_for_clinician.length !== source.questions_for_clinician.length) {
  throw new Error("Translation changed array lengths; refusing to write.");
}

const esReport = auditedReplay({
  ...source,
  patient_summary: object.patient_summary,
  findings: source.findings.map((f: Record<string, unknown>, index: number) => ({
    ...f,
    headline: object.findings[index]!.headline,
    mechanism: object.findings[index]!.mechanism,
    monitoring: object.findings[index]!.monitoring,
    why_this_patient: object.findings[index]!.why_this_patient,
  })),
  questions_for_clinician: object.questions_for_clinician,
}, now);

const enIds = JSON.stringify(source.findings.map((f: { evidence_ids: string[] }) => f.evidence_ids));
const esIds = JSON.stringify((esReport.findings as Array<{ evidence_ids: string[] }>).map((f) => f.evidence_ids));
if (enIds !== esIds) throw new Error("Evidence binding drifted during localization.");

write("es", esReport, now);
console.log(`golden pinned: EN + ES, ${source.findings.length} findings, ${source.evidence.length} evidence, bindings preserved.`);
