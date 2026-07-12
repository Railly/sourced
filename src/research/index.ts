import { ddinterPairKey, type DdinterDataset } from "../retrieve/ddinter.ts";
import type { Medication, PatientContext, ResearchCandidate, SafetyReport } from "../types/index.ts";

const DEFAULT_CAP = 5;

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
): ResearchDerivation {
  const unresolved: ResearchCandidate[] = report.unverified_removed.map((removed) => ({
    tier: "unresolved-concern",
    drugs: [],
    reason: removed.reason,
    question: `Can this flagged concern be confirmed or ruled out against primary evidence? "${removed.claim_text}"`,
    source: "adversarial verifier",
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
              reason: `DDInter documents the ${row.drugA} + ${row.drugB} pair but assigns no severity level.`,
              question: `Does concurrent ${row.drugA} and ${row.drugB} carry a clinically significant interaction? The pair is catalogued without a graded severity.`,
              source: `DDInter ${row.idA}/${row.idB}`,
            });
          }
        }
      }
    }
  }

  // Flagged concerns rank above unquantified pairs: a concern the tool raised
  // and could not source is a sharper research lead than a catalogued gap.
  const ordered = [...unresolved, ...knownUnknown];
  return { candidates: ordered.slice(0, cap), totalKnownUnknown: knownUnknown.length };
}

export function attachResearchCandidates(
  report: SafetyReport,
  patient: PatientContext | undefined,
  ddinter: DdinterDataset,
  cap?: number,
): SafetyReport {
  const derived = deriveResearchCandidates(patient, report, ddinter, cap);
  return {
    ...report,
    research_candidates: derived.candidates,
    research_total_known_unknown: derived.totalKnownUnknown,
  };
}
