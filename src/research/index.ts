import { ddinterPairKey, type DdinterDataset } from "../retrieve/ddinter.ts";
import type { Medication, PatientContext, ResearchCandidate, ReviewLocale, SafetyReport } from "../types/index.ts";

const DEFAULT_CAP = 5;

// Locale-aware templates for the research track. Drug names are proper nouns and
// stay verbatim in either language; only the surrounding sentence is localized.
export const RESEARCH_COPY = {
  en: {
    unresolvedQuestion: (claim: string) =>
      `Can this flagged concern be confirmed or ruled out against primary evidence? "${claim}"`,
    unresolvedSource: "adversarial verifier",
    knownReason: (a: string, b: string) =>
      `DDInter documents the ${a} + ${b} pair but assigns no severity level.`,
    knownQuestion: (a: string, b: string) =>
      `Does concurrent ${a} and ${b} carry a clinically significant interaction? The pair is catalogued without a graded severity.`,
  },
  es: {
    unresolvedQuestion: (claim: string) =>
      `¿Puede confirmarse o descartarse esta duda señalada contra evidencia primaria? "${claim}"`,
    unresolvedSource: "verificador adversarial",
    knownReason: (a: string, b: string) =>
      `DDInter documenta el par ${a} + ${b} pero no le asigna un nivel de gravedad.`,
    knownQuestion: (a: string, b: string) =>
      `¿La combinación de ${a} y ${b} conlleva una interacción clínicamente significativa? El par está catalogado sin gravedad graduada.`,
  },
} satisfies Record<ReviewLocale, unknown>;

function activeComponents(patient: PatientContext): { display: string; keys: string[] }[] {
  return patient.medications
    .filter((medication) => (medication.status ?? "active") === "active")
    .map((medication) => ({
      display: medication.name,
      keys: [medication.name, ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? [])]
        .flatMap((name) => name.toLowerCase().split("/"))
        .map((name) => name.trim())
        .filter(Boolean),
    }));
}

function pairIsAlreadyReported(a: string, b: string, report: SafetyReport): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  return report.findings.some((finding) => {
    const drugs = finding.drugs.map((drug) => drug.toLowerCase());
    return drugs.some((drug) => drug.includes(na) || na.includes(drug))
      && drugs.some((drug) => drug.includes(nb) || nb.includes(drug));
  });
}

const SEVERITY_WEIGHT: Record<string, number> = { major: 3, moderate: 2, minor: 1 };

function tokenize(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? [];
}

/**
 * Names the patient's own medications that a free-text claim refers to, matching
 * on a shared word stem so it works across languages: the claim may be Spanish
 * ("sertralina") while the med list is English ("sertraline"), but they share
 * the "sertral" stem. Returns the canonical med names so downstream scoring is
 * language-agnostic (concern.drugs end up in the same vocabulary as findings).
 */
function drugsNamedInClaim(claim: string, patient: PatientContext | undefined): string[] {
  const claimStems = new Set(tokenize(claim).map((word) => word.slice(0, 5)));
  const named: string[] = [];
  for (const medication of patient?.medications ?? []) {
    const hit = tokenize(medication.name).some((word) => word.length >= 5 && claimStems.has(word.slice(0, 5)));
    if (hit) named.push(medication.name);
  }
  return named;
}

/**
 * Builds the set of terms that describe the patient's ACUTE clinical picture:
 * their diagnoses plus the drugs named in the report's most severe findings.
 * These are the words a clinically-central research question should touch. The
 * signal is fully derived from the report and patient record, no model call.
 */
export function clinicalFocus(patient: PatientContext | undefined, report: SafetyReport): Set<string> {
  const terms = new Set<string>();
  for (const diagnosis of patient?.diagnoses ?? []) {
    for (const token of tokenize(diagnosis)) terms.add(token);
  }
  // Only the single most severe finding defines the acute event. Widening this
  // to every top-tier finding floods the focus and makes almost everything look
  // central; the goal is to identify the ONE unknown tied to the worst problem.
  const topSeverity = report.findings.reduce((max, finding) => Math.max(max, SEVERITY_WEIGHT[finding.severity] ?? 0), 0);
  if (topSeverity >= 3) {
    for (const finding of report.findings) {
      if ((SEVERITY_WEIGHT[finding.severity] ?? 0) < topSeverity) continue;
      for (const drug of finding.drugs) for (const token of tokenize(drug)) terms.add(token);
    }
  }
  return terms;
}

/**
 * Scores a candidate by how central it is to the patient's acute presentation.
 * A question whose drugs/reason overlap the acute diagnoses and the top-severity
 * findings ranks first, so the queue routes the unknown that explains the
 * clinical event before a peripheral, merely-untraceable gap. Ties break on
 * tier (a flagged-but-untraceable concern over a catalogued no-severity pair).
 */
export function relevanceScore(candidate: ResearchCandidate, focus: Set<string>): number {
  const haystack = new Set([
    ...candidate.drugs.flatMap(tokenize),
    ...tokenize(candidate.reason),
    ...tokenize(candidate.question),
  ]);
  let overlap = 0;
  for (const term of haystack) if (focus.has(term)) overlap += 1;
  const tierBonus = candidate.tier === "unresolved-concern" ? 0.5 : 0;
  return overlap + tierBonus;
}

export interface ResearchDerivation {
  candidates: ResearchCandidate[];
  totalKnownUnknown: number;
}

/**
 * Turns the pipeline's dead ends into research questions, deterministically and
 * with no model call. Two tiers, both grounded: a concern the adversarial
 * verifier removed for lack of a citable source, and a pair the interaction
 * database documents without assigning a severity. Benign no-data pairs are
 * never surfaced, so the queue stays small and defensible.
 */
export function deriveResearchCandidates(
  patient: PatientContext | undefined,
  report: SafetyReport,
  ddinter: DdinterDataset,
  cap: number = DEFAULT_CAP,
  locale: ReviewLocale = "en",
): ResearchDerivation {
  const copy = RESEARCH_COPY[locale];
  const unresolved: ResearchCandidate[] = report.unverified_removed.map((removed) => ({
    tier: "unresolved-concern",
    // Populate the drugs the concern is about from the patient's own med list,
    // matched by stem, so relevance scoring is language-agnostic even when the
    // claim text is translated but the findings/meds are canonical English.
    drugs: drugsNamedInClaim(removed.claim_text, patient),
    reason: removed.reason,
    question: copy.unresolvedQuestion(removed.claim_text),
    source: copy.unresolvedSource,
  }));

  const knownUnknown: ResearchCandidate[] = [];
  if (patient) {
    const meds = activeComponents(patient);
    const seen = new Set<string>();
    for (let i = 0; i < meds.length; i += 1) {
      for (let j = i + 1; j < meds.length; j += 1) {
        for (const keyA of meds[i]!.keys) {
          for (const keyB of meds[j]!.keys) {
            const row = ddinter.byPair.get(ddinterPairKey(keyA, keyB));
            if (!row || row.level !== "Unknown") continue;
            const dedupe = [row.idA, row.idB].sort().join("/");
            if (seen.has(dedupe)) continue;
            if (pairIsAlreadyReported(meds[i]!.display, meds[j]!.display, report)) continue;
            seen.add(dedupe);
            knownUnknown.push({
              tier: "known-unknown",
              drugs: [row.drugA, row.drugB],
              reason: copy.knownReason(row.drugA, row.drugB),
              question: copy.knownQuestion(row.drugA, row.drugB),
              source: `DDInter ${row.idA}/${row.idB}`,
            });
          }
        }
      }
    }
  }

  // Rank by clinical relevance to the patient's acute presentation, not just by
  // "what could not be traced". The unknown that explains the clinical event
  // (its drugs overlap the acute diagnoses and top-severity findings) routes
  // first; a peripheral untraceable gap routes last. Stable sort keeps original
  // order within an equal score. This is why, e.g., a serotonin-syndrome case
  // routes the serotonergic pair ahead of a marginal CYP pharmacokinetic aside.
  const ordered = rankCandidates([...unresolved, ...knownUnknown], patient, report);
  return { candidates: ordered.slice(0, cap), totalKnownUnknown: knownUnknown.length };
}

/**
 * Ranks candidates by clinical relevance to the patient's acute presentation
 * and marks the central ones. Stable within an equal score. Shared by the live
 * derivation and the offline re-rank of precomputed reviews so both use one
 * ordering rule.
 */
export function rankCandidates(
  candidates: ResearchCandidate[],
  patient: PatientContext | undefined,
  report: SafetyReport,
): ResearchCandidate[] {
  const focus = clinicalFocus(patient, report);
  // Backfill drugs on an untraceable concern that was stored without them (older
  // precomputed reviews), so the offline re-rank scores it the same as a live
  // derivation. The claim sits inside the question, between quotes.
  const enriched = candidates.map((candidate) => {
    if (candidate.tier !== "unresolved-concern" || candidate.drugs.length > 0) return candidate;
    const claim = candidate.question.match(/"([^"]+)"/)?.[1] ?? candidate.question;
    return { ...candidate, drugs: drugsNamedInClaim(claim, patient) };
  });
  const scored = enriched
    .map((candidate, index) => ({ candidate, index, score: relevanceScore(candidate, focus) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  // Mark exactly ONE candidate central, and only when it stands out: its score
  // must clear the threshold AND beat the runner-up. A flat field (everything
  // touches the acute drugs equally) yields no "central" badge rather than
  // lighting up the whole queue.
  const top = scored[0];
  const runnerUp = scored[1];
  const hasClearWinner = !!top && top.score >= 1 && (!runnerUp || top.score > runnerUp.score);
  return scored.map(({ candidate }, position) => ({
    ...candidate,
    clinically_central: hasClearWinner && position === 0,
  }));
}

export function attachResearchCandidates(
  report: SafetyReport,
  patient: PatientContext | undefined,
  ddinter: DdinterDataset,
  cap?: number,
  locale: ReviewLocale = "en",
): SafetyReport {
  const derived = deriveResearchCandidates(patient, report, ddinter, cap, locale);
  return {
    ...report,
    research_candidates: derived.candidates,
    research_total_known_unknown: derived.totalKnownUnknown,
  };
}
