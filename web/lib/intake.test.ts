import { expect, test } from "bun:test";
import type { IntakeExtraction } from "./intake";
import { ensureSourceScopeAmbiguity, intakeExtractionSchema } from "./intake";

const extraction: IntakeExtraction = {
  case: {
    medications: [{ raw: "ramipril 5 mg", status: "active", source_span: "ramipril 5 mg" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  },
  ambiguities: [],
  sourceSummary: "First case extracted.",
};

test("adds a deterministic scope ambiguity for multiple labeled cases", () => {
  const result = ensureSourceScopeAmbiguity(
    "Case no 1\nFirst patient text\n\nCase no 2\nSecond patient text",
    extraction,
  );
  expect(result.ambiguities[0]).toEqual({
    id: "source-scope",
    field: "patient scope",
    question: "This source contains multiple labeled cases. Confirm that only the first labeled case should be reviewed.",
  });
});

test("localizes the deterministic scope question without changing its machine identity", () => {
  const result = ensureSourceScopeAmbiguity(
    "Case 1\nPrimer caso\nCase 2\nSegundo caso",
    extraction,
    "es",
  );
  expect(result.ambiguities[0]).toEqual({
    id: "source-scope",
    field: "patient scope",
    question: "Esta fuente contiene varios casos identificados. Confirma que debe revisarse solo el primer caso.",
  });
});

test("detects labeled cases after PDF layout is collapsed", () => {
  const result = ensureSourceScopeAmbiguity(
    "Dataset note Case Report Case no 1 36 year old patient text. Case no 2 8 year old patient text.",
    extraction,
  );
  expect(result.ambiguities[0]?.id).toBe("source-scope");
});

test("does not ask for scope on a single-case source", () => {
  expect(ensureSourceScopeAmbiguity("Case Report\nOne patient only", extraction)).toBe(extraction);
});

test("does not duplicate a model-provided scope ambiguity", () => {
  const withScope = {
    ...extraction,
    ambiguities: [{ id: "scope", field: "case scope", question: "Confirm the first case." }],
  };
  const result = ensureSourceScopeAmbiguity("Case 1\nFirst\nCase 2\nSecond", withScope);
  expect(result.ambiguities).toHaveLength(1);
  expect(result.ambiguities[0]?.id).toBe("source-scope");
});

test("accepts a detailed source-grounded medication episode up to 500 characters", () => {
  const result = intakeExtractionSchema.safeParse({
    ...extraction,
    case: {
      ...extraction.case,
      medications: [{ ...extraction.case.medications[0], episode: "e".repeat(500) }],
    },
  });
  expect(result.success).toBe(true);
});

test("rejects a medication episode above the bounded payload limit", () => {
  const result = intakeExtractionSchema.safeParse({
    ...extraction,
    case: {
      ...extraction.case,
      medications: [{ ...extraction.case.medications[0], episode: "e".repeat(501) }],
    },
  });
  expect(result.success).toBe(false);
});
