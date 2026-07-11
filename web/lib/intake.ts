import { z } from "zod";

export const medicationStatusSchema = z.enum([
  "active",
  "historical",
  "held",
  "stopped",
  "one-time",
  "indirect-exposure",
  "uncertain",
]);

const medicationFields = {
  raw: z.string().min(1).max(240),
  episode: z.string().max(500).optional(),
  start: z.string().max(120).optional(),
  end: z.string().max(120).optional(),
  source_span: z.string().max(500).optional(),
};

const medicationInputSchema = z.object({
  ...medicationFields,
  status: medicationStatusSchema.default("active"),
});

const extractedMedicationInputSchema = z.object({
  ...medicationFields,
  status: medicationStatusSchema,
});

export const reviewCaseInputSchema = z.object({
  note: z.string().max(40_000).optional(),
  medications: z.array(medicationInputSchema).min(1).max(40),
  allergies: z.array(z.string().max(240)).max(40),
  diagnoses: z.array(z.string().max(480)).max(40),
  labs: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        value: z.number().finite(),
        unit: z.string().max(80),
        refLow: z.number().finite().optional(),
        refHigh: z.number().finite().optional(),
      }),
    )
    .max(60),
});

export const intakeAmbiguitySchema = z.object({
  id: z.string().min(1).max(80),
  field: z.string().min(1).max(120),
  question: z.string().min(1).max(500),
});

export const intakeExtractionSchema = z.object({
  case: reviewCaseInputSchema.extend({
    medications: z.array(extractedMedicationInputSchema).min(1).max(40),
  }),
  ambiguities: z.array(intakeAmbiguitySchema).max(8),
  sourceSummary: z.string().max(500),
});

export type IntakeAmbiguity = z.infer<typeof intakeAmbiguitySchema>;
export type IntakeExtraction = z.infer<typeof intakeExtractionSchema>;

export function ensureSourceScopeAmbiguity(
  source: string,
  extraction: IntakeExtraction,
  locale: "en" | "es" = "en",
): IntakeExtraction {
  const labeledCaseNumbers = new Set([
    ...source.matchAll(/\bcase\s*(?:no\.?|number|#)\s*(\d{1,3})\b/gi),
    ...source.matchAll(/^\s*case\s+(\d{1,3})\b/gim),
    ...source.matchAll(/^\s*patient\s+(\d{1,3})\b/gim),
  ].flatMap((match) => match[1] ? [match[1]] : []));
  if (labeledCaseNumbers.size < 2) return extraction;
  const existingIndex = extraction.ambiguities.findIndex((item) =>
    /scope|patient|case/i.test(`${item.field} ${item.question}`)
  );
  if (existingIndex >= 0) {
    const existing = extraction.ambiguities[existingIndex];
    return {
      ...extraction,
      ambiguities: [
        { ...existing, id: "source-scope", field: "patient scope" },
        ...extraction.ambiguities.filter((_, index) => index !== existingIndex),
      ].slice(0, 8),
    };
  }
  return {
    ...extraction,
    ambiguities: [
      {
        id: "source-scope",
        field: "patient scope",
        question: locale === "es"
          ? "Esta fuente contiene varios casos identificados. Confirma que debe revisarse solo el primer caso."
          : "This source contains multiple labeled cases. Confirm that only the first labeled case should be reviewed.",
      },
      ...extraction.ambiguities,
    ].slice(0, 8),
  };
}
