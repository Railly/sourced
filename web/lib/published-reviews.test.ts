import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import type { SafetyReport } from "@/lib/types";
import type { IntakeExtraction } from "@/lib/intake";
import publishedCaseData from "@/public/data/published-cases.json";

const reviewsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data/reviews");
const publishedCases = (publishedCaseData as { cases: Array<{ id: string }> }).cases;

interface PrecomputedReview {
  id: string;
  locale: string;
  intake: IntakeExtraction | null;
  report: SafetyReport;
}

function load(id: string, locale: string): PrecomputedReview {
  const path = resolve(reviewsDir, `${id}.${locale}.json`);
  expect(existsSync(path), `missing precomputed review ${id}.${locale}.json`).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as PrecomputedReview;
}

test("the golden case has an offline precomputed review in both locales", () => {
  for (const locale of ["en", "es"]) {
    const review = load("golden", locale);
    expect(review.report.findings.length).toBeGreaterThan(0);
    expect(review.report.pipeline?.mode).toBe("audited-replay");
  }
});

test("every published case has an offline precomputed English review", () => {
  for (const item of publishedCases) {
    const review = load(item.id, "en");
    expect(review.intake, `${item.id} intake`).not.toBeNull();
    expect(review.report.pipeline?.mode).toBe("audited-replay");
    // Every rendered finding must resolve to cited evidence; the offline packet
    // must carry the same provenance guarantee as a live run.
    for (const finding of review.report.findings) {
      for (const evidenceId of finding.evidence_ids) {
        expect(review.report.evidence.some((evidence) => evidence.id === evidenceId), `${item.id} evidence ${evidenceId}`).toBe(true);
      }
    }
  }
});
