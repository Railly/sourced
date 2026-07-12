import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runVerifiedReview } from "@core/review";
import { flushRxNavCache } from "@core/ingest/rxnav-cache";
import type { SafetyReport } from "@core/types/index";
import { extractIntake, type IntakeLocale } from "@/lib/intake-extract";
import type { IntakeExtraction } from "@/lib/intake";
import { draftFromCase, type ReviewCaseInput, serializeReviewCase } from "@/lib/review-case";
import publishedCaseData from "@/public/data/published-cases.json";
import goldenCaseData from "../../data/fixtures/discharge-hf-afib.json";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const outDir = resolve(webRoot, "public/data/reviews");
const casesTextDir = resolve(repoRoot, "data/case-reports/text");

const locales: IntakeLocale[] = ["en", "es"];
const onlyLocale = process.argv.find((arg) => arg.startsWith("--locale="))?.split("=")[1] as IntakeLocale | undefined;
const onlyCase = process.argv.find((arg) => arg.startsWith("--case="))?.split("=")[1];
const force = process.argv.includes("--force");

const goldenCase = goldenCaseData as ReviewCaseInput;
const publishedCases = (publishedCaseData as { cases: Array<{ id: string }> }).cases;

interface PrecomputedReview {
  id: string;
  locale: IntakeLocale;
  intake: IntakeExtraction | null;
  report: SafetyReport;
  generatedAt: string;
}

function stampReport(report: SafetyReport, generatedAt: string): SafetyReport {
  return {
    ...report,
    generated_at: generatedAt,
    pipeline: report.pipeline ? { ...report.pipeline, mode: "audited-replay" } : report.pipeline,
  };
}

async function buildOne(id: string, locale: IntakeLocale, source: string | null): Promise<void> {
  const outPath = resolve(outDir, `${id}.${locale}.json`);
  if (!force && existsSync(outPath)) {
    console.log(`skip  ${id}.${locale} (exists)`);
    return;
  }
  const generatedAt = new Date().toISOString();
  let intake: IntakeExtraction | null = null;
  let reviewCase: ReviewCaseInput;

  if (source) {
    intake = await extractIntake(source, locale);
    reviewCase = serializeReviewCase(draftFromCase(intake.case));
  } else {
    reviewCase = goldenCase;
  }

  const report = stampReport(await runVerifiedReview(reviewCase, { locale, now: generatedAt }), generatedAt);
  const payload: PrecomputedReview = { id, locale, intake, report, generatedAt };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  flushRxNavCache();
  console.log(`ok    ${id}.${locale} — ${report.findings.length} findings, ${report.evidence.length} evidence`);
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const activeLocales = onlyLocale ? [onlyLocale] : locales;

  // The golden review is pinned to the vetted, mechanism-rich report.json
  // (EN) and its faithful localization (localize-golden-es.ts). It is never
  // re-synthesized here: the synthesis step is inconsistent at binding the FDA
  // CYP2C9 mechanism for warfarin + amiodarone, and the golden is the on-camera
  // case that must stay strong. Regenerate it with `bun run build:golden`.
  for (const locale of activeLocales) {
    for (const item of publishedCases) {
      if (onlyCase && onlyCase !== item.id) continue;
      const textPath = resolve(casesTextDir, `${item.id}.md`);
      if (!existsSync(textPath)) {
        console.warn(`warn  missing text for ${item.id}`);
        continue;
      }
      const source = readFileSync(textPath, "utf8");
      try {
        await buildOne(item.id, locale, source);
      } catch (error) {
        console.error(`FAIL  ${item.id}.${locale}: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    }
  }
  flushRxNavCache();
}

await main();
