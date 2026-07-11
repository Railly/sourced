// Sourced — DETERMINISTIC RETRIEVAL.
// No LLM in this layer. Every clinical fact is fetched from a cited source and
// wrapped in an EvidenceObject. This is both the anti-hallucination moat and the
// Fable-guardrail bypass: no clinical query ever reaches a model.

import type { EvidenceObject, Medication, PatientContext } from "../types/index.ts";
import {
  ddinterPairKey,
  loadDdinter,
  type DdinterDataset,
  type DdinterRow,
} from "./ddinter.ts";
import { getSourceJson } from "./source-cache.ts";

export { createDdinterDataset, loadDdinter, parseCsv, parseDdinterCsv } from "./ddinter.ts";
export type { DdinterCoverage, DdinterDataset, DdinterRow } from "./ddinter.ts";

const OPENFDA_LABEL = "https://api.fda.gov/drug/label.json";
const OPENFDA_EVENT = "https://api.fda.gov/drug/event.json";
interface OpenFdaLabel {
  set_id?: string;
  effective_time?: string;
  version?: string;
  openfda?: { generic_name?: string[]; brand_name?: string[] };
  drug_interactions?: string[];
  drug_and_or_laboratory_test_interactions?: string[];
  boxed_warning?: string[];
}

function labelNameScore(label: OpenFdaLabel, medicationName: string): number {
  const target = medicationName.toLowerCase();
  const genericNames = label.openfda?.generic_name?.map((name) => name.toLowerCase()) ?? [];
  const brandNames = label.openfda?.brand_name?.map((name) => name.toLowerCase()) ?? [];
  let score = 0;
  if (genericNames.some((name) => name === target)) score += 100;
  else if (genericNames.some((name) => name.includes(target) || target.includes(name))) score += 70;
  if (brandNames.some((name) => name === target)) score += 60;
  if (label.drug_interactions?.[0] || label.drug_and_or_laboratory_test_interactions?.[0]) {
    score += 30;
  }
  if (label.boxed_warning?.[0]) score += 10;
  return score;
}

export function selectBestLabel(
  results: OpenFdaLabel[] | undefined,
  medicationName: string,
): OpenFdaLabel | null {
  if (!results?.length) return null;
  return [...results].sort((left, right) => {
    const score = labelNameScore(right, medicationName) - labelNameScore(left, medicationName);
    if (score !== 0) return score;
    const effective = Number(right.effective_time ?? 0) - Number(left.effective_time ?? 0);
    if (effective !== 0) return effective;
    return Number(right.version ?? 0) - Number(left.version ?? 0);
  })[0] ?? null;
}

function sentenceCandidates(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((value) => value.trim())
    .filter(Boolean);
}

export function selectSupportingPassage(text: string, relatedTerms: string[]): string {
  const sentences = sentenceCandidates(text);
  const normalizedTerms = relatedTerms.map((term) => term.toLowerCase()).filter(Boolean);
  if (normalizedTerms.length === 0) {
    return sentences.find((sentence) => sentence.length >= 40)?.slice(0, 700) ?? text.slice(0, 700);
  }
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index]!.toLowerCase();
    const termMatches = normalizedTerms.filter((term) => sentence.includes(term)).length;
    const actionMatches = (sentence.match(/monitor|increase|decrease|inhibit|bleed|risk|avoid/g) ?? [])
      .length;
    const score = termMatches * 1000 + actionMatches * 10 - Math.min(sentence.length / 1000, 3);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  let first = sentences[bestIndex] ?? text;
  if (first.length > 700) {
    const lowered = first.toLowerCase();
    const hit = normalizedTerms
      .map((term) => lowered.indexOf(term))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    if (hit !== undefined) {
      const start = Math.max(0, hit - 90);
      first = first.slice(start, start + 700).trim();
    }
  }
  const next = sentences[bestIndex + 1];
  const nextIsRelevant = next
    ? normalizedTerms.some((term) => next.toLowerCase().includes(term)) ||
      /monitor|increase|decrease|inhibit|bleed|risk|avoid|reduce/i.test(next)
    : false;
  return next && nextIsRelevant && `${first} ${next}`.length <= 700
    ? `${first} ${next}`
    : first.slice(0, 700);
}

function sourceVersion(label: OpenFdaLabel): string | undefined {
  const parts = [
    label.effective_time ? `effective ${label.effective_time}` : undefined,
    label.version ? `version ${label.version}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** openFDA drug_interactions section (PLR §7) for one drug. Verbatim, citable. */
async function labelInteractions(
  med: Medication,
  relatedTerms: string[],
  now: string,
): Promise<EvidenceObject[]> {
  const query = `${OPENFDA_LABEL}?search=openfda.generic_name:"${encodeURIComponent(med.name)}"&limit=20`;
  const response = await getSourceJson(query, now);
  const result = selectBestLabel(response?.data?.results, med.name);
  if (!result) return [];

  const setId: string = result.set_id ?? "unknown";
  const splUrl = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`;
  const evidence: EvidenceObject[] = [];

  const field =
    result.drug_interactions?.[0] ?? result.drug_and_or_laboratory_test_interactions?.[0];
  if (field) {
    evidence.push({
      id: `label:${med.rxcui}:interactions`,
      claim_text: `FDA label drug-interactions section for ${med.name}`,
      source_name: "openFDA-label",
      source_id: setId,
      source_url: splUrl,
      exact_field: "drug_interactions",
      quoted_text: field.slice(0, 4000),
      supporting_text: selectSupportingPassage(field, relatedTerms),
      source_version: sourceVersion(result),
      anchor_drug: med.name,
      retrieval_query: query,
      retrieved_at: response?.retrievedAt ?? now,
    });
  }

  const boxed = result.boxed_warning?.[0];
  if (boxed) {
    evidence.push({
      id: `label:${med.rxcui}:boxed`,
      claim_text: `FDA boxed warning for ${med.name}`,
      source_name: "openFDA-label",
      source_id: setId,
      source_url: splUrl,
      exact_field: "boxed_warning",
      quoted_text: boxed.slice(0, 2000),
      supporting_text: selectSupportingPassage(boxed, []),
      source_version: sourceVersion(result),
      anchor_drug: med.name,
      retrieval_query: query,
      retrieved_at: response?.retrievedAt ?? now,
    });
  }
  return evidence;
}

/** DDInter severity for a specific pair, as an EvidenceObject. */
function medicationComponents(medication: Medication): string[] {
  return [medication.name, ...(medication.ingredients?.map((ingredient) => ingredient.name) ?? [])]
    .flatMap((name) => name.toLowerCase().split("/"))
    .map((name) => name.trim())
    .filter(Boolean);
}

export function ddinterPair(
  a: Medication,
  b: Medication,
  dataset: DdinterDataset,
  now: string,
): EvidenceObject | null {
  const aNames = medicationComponents(a);
  const bNames = medicationComponents(b);
  const severityRank: Record<string, number> = {
    Major: 4,
    Moderate: 3,
    Minor: 2,
    Unknown: 1,
  };
  const matches: DdinterRow[] = [];
  for (const aName of aNames) {
    for (const bName of bNames) {
      const match = dataset.byPair.get(ddinterPairKey(aName, bName));
      if (match) matches.push(match);
    }
  }
  const hit = matches.reduce<DdinterRow | null>((strongest, row) => {
    if (!strongest) return row;
    return (severityRank[row.level] ?? 0) > (severityRank[strongest.level] ?? 0) ? row : strongest;
  }, null);
  if (!hit) return null;
  return {
    id: `ddinter:${hit.idA}:${hit.idB}`,
    claim_text: `DDInter severity for ${a.name} + ${b.name}: ${hit.level}`,
    source_name: "DDInter",
    source_id: `${hit.idA}/${hit.idB}`,
    source_url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8728114/",
    exact_field: "Level",
    quoted_text: `Drug_A: ${hit.drugA}; Drug_B: ${hit.drugB}; Level: ${hit.level}`,
    supporting_text: `Drug_A: ${hit.drugA}; Drug_B: ${hit.drugB}; Level: ${hit.level}`,
    subject_drugs: [hit.drugA, hit.drugB],
    retrieval_query: `local DDInter ${hit.sourceFile ?? "CSV"} row: ${hit.idA} (${hit.drugA}) x ${hit.idB} (${hit.drugB})`,
    retrieved_at: now,
  };
}

/** FAERS real-world co-report signal (NOT causation). Clearly labeled. */
async function faersSignal(
  med: Medication,
  reaction: string,
  now: string,
): Promise<EvidenceObject | null> {
  const query = `${OPENFDA_EVENT}?search=patient.drug.medicinalproduct:"${encodeURIComponent(
    med.name,
  )}"+AND+patient.reaction.reactionmeddrapt:"${encodeURIComponent(reaction)}"&limit=1`;
  const response = await getSourceJson(query, now);
  const total = response?.data?.meta?.results?.total;
  if (typeof total !== "number" || total === 0) return null;
  return {
    id: `faers:${med.rxcui}:${reaction}`,
    claim_text: `${total.toLocaleString()} FAERS reports co-mention ${med.name} and ${reaction} (spontaneous-report signal, not causation)`,
    source_name: "openFDA-FAERS",
    source_id: `faers-count-${total}`,
    source_url: "https://open.fda.gov/apis/drug/event/",
    exact_field: "meta.results.total",
    quoted_text: String(total),
    supporting_text: `${total.toLocaleString()} co-reports`,
    subject_drugs: [med.name],
    retrieval_query: query,
    retrieved_at: response?.retrievedAt ?? now,
  };
}

export interface RetrievalResult {
  evidence: EvidenceObject[];
  ddinter: DdinterDataset;
}

export function selectActiveMedicationsForRetrieval(patient: PatientContext): Medication[] {
  return patient.medications.filter(
    (medication) => medication.rxcui && (medication.status ?? "active") === "active",
  );
}

export function medicationPairsForRetrieval(
  patient: PatientContext,
): Array<readonly [Medication, Medication]> {
  const medications = selectActiveMedicationsForRetrieval(patient);
  const pairs: Array<readonly [Medication, Medication]> = [];
  for (let index = 0; index < medications.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < medications.length; otherIndex += 1) {
      pairs.push([medications[index]!, medications[otherIndex]!]);
    }
  }
  return pairs;
}

export function medicationLabelTargets(medications: Medication[]): Medication[] {
  const targets = new Map<string, Medication>();
  for (const medication of medications) {
    targets.set(`${medication.rxcui ?? ""}:${medication.name.toLowerCase()}`, medication);
    for (const ingredient of medication.ingredients ?? []) {
      targets.set(`${ingredient.rxcui}:${ingredient.name.toLowerCase()}`, {
        ...medication,
        name: ingredient.name,
        rxcui: ingredient.rxcui,
        resolution: "exact",
      });
    }
  }
  return [...targets.values()];
}

/**
 * Retrieve all citable evidence for a patient's medications.
 * @param now ISO timestamp — passed in so this stays deterministic/testable.
 */
export async function retrieve(
  patient: PatientContext,
  ddinterCsvPath: string,
  now: string,
): Promise<RetrievalResult> {
  const meds = selectActiveMedicationsForRetrieval(patient);
  const labelTargets = medicationLabelTargets(meds);
  const ddinter = await loadDdinter(ddinterCsvPath);
  const evidence: EvidenceObject[] = [];

  // Per-drug: FDA label interactions + boxed warnings.
  for (const med of labelTargets) {
    const relatedTerms = labelTargets
      .filter((candidate) => candidate.rxcui !== med.rxcui || candidate.name !== med.name)
      .flatMap((candidate) => medicationComponents(candidate));
    evidence.push(...(await labelInteractions(med, relatedTerms, now)));
  }

  // Per-pair: DDInter severity.
  for (const [left, right] of medicationPairsForRetrieval(patient)) {
    const ev = ddinterPair(left, right, ddinter, now);
    if (ev) evidence.push(ev);
  }

  // Real-world signal for the anchor drug's key adverse event.
  const warfarin = meds.find((m) => m.name.toLowerCase().includes("warfarin"));
  if (warfarin) {
    const sig = await faersSignal(warfarin, "haemorrhage", now);
    if (sig) evidence.push(sig);
  }

  return { evidence: [...new Map(evidence.map((item) => [item.id, item])).values()], ddinter };
}
