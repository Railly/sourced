import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RESEARCH_COPY, rankCandidates } from "@core/research/index";
import type { ResearchCandidate, ReviewLocale, SafetyReport } from "@core/types/index";

// Re-localizes and re-ranks the research_candidates stored in each precomputed
// review. The research track was English-only when these were generated, so the
// question/reason/source strings are rebuilt in the file's own locale (drug
// names stay verbatim), then ranked by clinical relevance. No model call.

const reviewsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data/reviews");

interface Precomputed {
  locale?: ReviewLocale;
  report: SafetyReport & { research_candidates?: ResearchCandidate[] };
}

function localeFor(file: string): ReviewLocale {
  return file.endsWith(".es.json") ? "es" : "en";
}

// Rebuilds a candidate's user-facing strings in the target locale. The claim of
// an unresolved concern is already localized in the stored question (between
// quotes); a known-unknown is regenerated from its two drug names.
function relocalize(candidate: ResearchCandidate, locale: ReviewLocale): ResearchCandidate {
  const copy = RESEARCH_COPY[locale];
  if (candidate.tier === "unresolved-concern") {
    const claim = candidate.question.match(/"([^"]+)"/)?.[1] ?? candidate.question;
    return { ...candidate, question: copy.unresolvedQuestion(claim), source: copy.unresolvedSource };
  }
  const [a, b] = candidate.drugs;
  if (!a || !b) return candidate;
  return { ...candidate, reason: copy.knownReason(a, b), question: copy.knownQuestion(a, b) };
}

let changed = 0;
for (const file of readdirSync(reviewsDir)) {
  if (!file.endsWith(".json")) continue;
  const path = resolve(reviewsDir, file);
  const data = JSON.parse(readFileSync(path, "utf8")) as Precomputed;
  const candidates = data.report?.research_candidates;
  if (!candidates || candidates.length === 0) continue;
  const locale = localeFor(file);
  const localized = candidates.map((candidate) => relocalize(candidate, locale));
  const reranked = rankCandidates(localized, data.report.patient, data.report);
  data.report.research_candidates = reranked;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  const central = reranked.find((candidate) => candidate.clinically_central);
  changed += 1;
  console.log(`${file} [${locale}]: ${reranked.length} candidates, central=${central ? central.drugs.join("+") || "concern" : "none"}`);
}
console.log(`\nRe-localized + re-ranked ${changed} reviews.`);
