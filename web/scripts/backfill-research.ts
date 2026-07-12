import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDdinter } from "@core/retrieve/ddinter";
import { deriveResearchCandidates } from "@core/research/index";
import type { SafetyReport } from "@core/types/index";

/**
 * Backfills research candidates into the precomputed showcase reviews without
 * re-running the model pipeline. The derivation is deterministic, so the
 * offline reviews gain the research queue while every finding, evidence
 * binding, and narrative stays byte-identical.
 */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const reviewsDir = resolve(webRoot, "public/data/reviews");

const ddinter = await loadDdinter(resolve(repoRoot, "data/sources/ddinter"));

for (const file of readdirSync(reviewsDir).filter((name) => name.endsWith(".json"))) {
  const path = resolve(reviewsDir, file);
  const payload = JSON.parse(readFileSync(path, "utf8")) as { report: SafetyReport };
  const report = payload.report;
  const derived = deriveResearchCandidates(report.patient, report, ddinter);
  report.research_candidates = derived.candidates;
  report.research_total_known_unknown = derived.totalKnownUnknown;
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`${file.padEnd(56)} ${derived.candidates.length} routed (${derived.totalKnownUnknown} known-unknown total)`);
}
