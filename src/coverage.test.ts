import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ddinterPair, loadDdinter } from "./retrieve/index.ts";
import type { Medication } from "./types/index.ts";

interface CoverageCase {
  id: string;
  domain: string;
  _meta: { kind: string };
  expected_pair?: [string, string];
  expected_severity?: string;
  expected_ingredient_rxcui?: string;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = (await Bun.file(resolve(repoRoot, "data/fixtures/clinical-coverage.json")).json()) as CoverageCase[];
const dataset = await loadDdinter(resolve(repoRoot, "data/sources/ddinter"));
const now = "2026-07-10T00:00:00.000Z";

function medication(name: string): Medication {
  return { raw: name, name, rxcui: "fixture", resolution: "exact" };
}

test("coverage suite contains the five required medication-safety domains", () => {
  expect(new Set(cases.map((item) => item.domain))).toEqual(
    new Set(["renal", "qt", "serotonergic", "duplication", "combination"]),
  );
  expect(cases.every((item) => item._meta.kind === "synthetic-realistic")).toBe(true);
});

for (const scenario of cases.filter((item) => item.expected_pair)) {
  test(`${scenario.domain} case resolves against bundled DDInter evidence`, () => {
    const [drugA, drugB] = scenario.expected_pair!;
    const evidence = ddinterPair(medication(drugA), medication(drugB), dataset, now);
    expect(evidence?.quoted_text).toContain(`Level: ${scenario.expected_severity}`);
    expect(evidence?.retrieval_query).toContain("ddinter_downloads_code_");
  });
}

test("duplication case pins the RxNorm warfarin ingredient", () => {
  const scenario = cases.find((item) => item.domain === "duplication");
  expect(scenario?.expected_ingredient_rxcui).toBe("11289");
});
