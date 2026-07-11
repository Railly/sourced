import { z } from "zod";

export const lensModes = ["priorities", "evidence", "handoff", "comparison"] as const;

const stackElement = z.object({
  type: z.literal("ReviewStack"),
  visible: z.literal(true),
  props: z.object({ mode: z.enum(lensModes) }),
  children: z.array(z.string()).min(1).max(12),
});

const verificationElement = z.object({
  type: z.literal("VerificationSummary"),
  visible: z.literal(true),
  props: z.object({}),
  children: z.array(z.string()).max(0),
});

const riskOverviewElement = z.object({
  type: z.literal("RiskOverview"),
  visible: z.literal(true),
  props: z.object({ findingIds: z.array(z.string()).min(1).max(6) }),
  children: z.array(z.string()).max(0),
});

const findingElement = z.object({
  type: z.literal("FindingDetail"),
  visible: z.literal(true),
  props: z.object({ findingId: z.string() }),
  children: z.array(z.string()).max(0),
});

const evidenceElement = z.object({
  type: z.literal("EvidencePanel"),
  visible: z.literal(true),
  props: z.object({ evidenceId: z.string() }),
  children: z.array(z.string()).max(0),
});

const questionsElement = z.object({
  type: z.literal("QuestionsPanel"),
  visible: z.literal(true),
  props: z.object({ questionIndexes: z.array(z.number().int().nonnegative()).max(8) }),
  children: z.array(z.string()).max(0),
});

const comparisonElement = z.object({
  type: z.literal("PairwiseComparison"),
  visible: z.literal(true),
  props: z.object({ findingId: z.string() }),
  children: z.array(z.string()).max(0),
});

export const safeElementSchema = z.discriminatedUnion("type", [
  stackElement,
  verificationElement,
  riskOverviewElement,
  findingElement,
  evidenceElement,
  questionsElement,
  comparisonElement,
]);

export const safeSpecSchema = z.object({
  root: z.string(),
  elements: z.record(z.string(), safeElementSchema),
});

export type SafeSpec = z.infer<typeof safeSpecSchema>;
export type LensMode = (typeof lensModes)[number];

export function validateSafeSpec(value: unknown): SafeSpec {
  const spec = safeSpecSchema.parse(value);
  const entries = Object.entries(spec.elements);
  if (entries.length > 18) throw new Error("Generated view exceeds the component limit");
  if (!spec.elements[spec.root]) throw new Error("Generated view root is missing");
  for (const [, element] of entries) {
    for (const child of element.children ?? []) {
      if (!spec.elements[child]) throw new Error(`Generated view references missing child ${child}`);
    }
  }
  return spec;
}
