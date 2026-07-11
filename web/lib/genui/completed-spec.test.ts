import { expect, test } from "bun:test";
import type { SafetyReport } from "@/lib/types";
import { buildCompletedReviewSpec, buildRunningReviewSpec } from "./completed-spec";

function sampleReport(findings: number, questions: number): SafetyReport {
  return {
    generated_at: "2026-07-11T00:00:00.000Z",
    patient_summary: "summary",
    findings: Array.from({ length: findings }, (_, index) => ({
      headline: `Finding ${index}`,
      status: "red-flag",
      severity: "major",
      drugs: ["drug-a", "drug-b"],
      mechanism: "mechanism",
      why_this_patient: "context",
      evidence_ids: [],
    })),
    evidence: [],
    questions_for_clinician: Array.from({ length: questions }, (_, index) => `Q${index}`),
    unverified_removed: [],
    pipeline: { mode: "audited-replay", model: "Claude Opus 4.8", stages: ["ingest", "retrieve", "synthesize", "verify"] },
  } as unknown as SafetyReport;
}

test("completed spec round-trips the exact report through the LiveReview root", () => {
  const report = sampleReport(2, 3);
  const spec = buildCompletedReviewSpec(report, "en");
  const root = spec.elements[spec.root!];
  expect(root?.type).toBe("LiveReview");
  expect((root?.props as { report: unknown }).report).toBe(report);
});

test("completed spec child order matches the live stream contract", () => {
  const report = sampleReport(2, 1);
  const spec = buildCompletedReviewSpec(report, "en");
  const root = spec.elements[spec.root!];
  expect(root?.children).toEqual(["pipeline", "verification", "risks", "finding-0", "finding-1", "questions"]);
  expect(spec.elements.risks?.props).toEqual({ findingIds: ["finding-0", "finding-1"] });
  expect(spec.elements.questions?.props).toEqual({ questionIndexes: [0] });
  expect(spec.elements.pipeline?.props).toMatchObject({ stage: "verify", status: "completed" });
});

test("completed spec omits risks and questions when empty", () => {
  const report = sampleReport(0, 0);
  const spec = buildCompletedReviewSpec(report, "en");
  const root = spec.elements[spec.root!];
  expect(root?.children).toEqual(["pipeline", "verification"]);
  expect(spec.elements.risks).toBeUndefined();
  expect(spec.elements.questions).toBeUndefined();
});

test("running spec localizes the pipeline detail", () => {
  expect((buildRunningReviewSpec("verify", "es").elements.pipeline?.props as { detail: string }).detail)
    .toContain("Reverificando");
  expect((buildRunningReviewSpec("verify", "en").elements.pipeline?.props as { detail: string }).detail)
    .toContain("Rechecking");
});
