import { expect, test } from "bun:test";
import type { EvidenceObject, SafetyReport } from "../types/index.ts";
import { verify } from "./index.ts";

const evidence: EvidenceObject[] = [
  {
    id: "label:1:interactions",
    claim_text: "x",
    source_name: "openFDA-label",
    source_id: "s1",
    source_url: "https://example.test/1",
    exact_field: "drug_interactions",
    quoted_text: "some text",
    retrieval_query: "q",
    retrieved_at: "2026-07-09T00:00:00Z",
  },
];

function draft(overrides: Partial<SafetyReport["findings"][number]>): SafetyReport {
  return {
    patient_summary: "t",
    findings: [
      {
        status: "flagged",
        severity: "major",
        drugs: ["a", "b"],
        headline: "h",
        mechanism: "m",
        why_this_patient: "w",
        evidence_ids: [],
        ...overrides,
      },
    ],
    questions_for_clinician: [],
    evidence,
    unverified_removed: [],
    generated_at: "2026-07-09T00:00:00Z",
  };
}

// Level 1 (deterministic) runs regardless of the adversarial pass. Disable
// adversarial so these are hermetic (no model call).

test("level 1 removes a finding with no evidence_ids", async () => {
  const result = await verify(draft({ evidence_ids: [] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed).toHaveLength(1);
  expect(result.unverified_removed[0]?.reason).toContain("no evidence_ids");
});

test("level 1 removes a finding citing an unknown evidence_id", async () => {
  const result = await verify(draft({ evidence_ids: ["label:999:nope"] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed[0]?.reason).toContain("Unresolved evidence_id");
});

test("level 1 keeps a finding whose evidence_ids all resolve", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    adversarial: false,
  });
  expect(result.findings).toHaveLength(1);
  expect(result.unverified_removed).toHaveLength(0);
});

test("level 1 dedupes repeated evidence_ids", async () => {
  const result = await verify(
    draft({ evidence_ids: ["label:1:interactions", "label:1:interactions"] }),
    evidence,
    { adversarial: false },
  );
  expect(result.findings[0]?.evidence_ids).toEqual(["label:1:interactions"]);
});

test("level 2 fails closed when the adversarial reviewer is unavailable", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => {
      throw new Error("reviewer unavailable");
    },
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed).toHaveLength(1);
  expect(result.unverified_removed[0]?.reason).toContain("not rendered");
});

test("level 2 removes a finding that goes beyond its cited source", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => ({
      supported: false,
      unsupported_claims: ["exact numeric increase is absent"],
    }),
  });
  expect(result.findings).toHaveLength(0);
  expect(result.unverified_removed[0]?.reason).toContain("exact numeric increase is absent");
});

test("level 2 keeps a finding fully supported by its cited source", async () => {
  const result = await verify(draft({ evidence_ids: ["label:1:interactions"] }), evidence, {
    reviewer: async () => ({ supported: true, unsupported_claims: [] }),
  });
  expect(result.findings).toHaveLength(1);
  expect(result.unverified_removed).toHaveLength(0);
});
