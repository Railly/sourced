// Sourced — DETERMINISTIC RETRIEVAL.
// No LLM in this layer. Every clinical fact is fetched from a cited source and
// wrapped in an EvidenceObject. This is both the anti-hallucination moat and the
// Fable-guardrail bypass: no clinical query ever reaches a model.

import type { EvidenceObject, Medication, PatientContext } from "../types/index.ts";

const OPENFDA_LABEL = "https://api.fda.gov/drug/label.json";
const OPENFDA_EVENT = "https://api.fda.gov/drug/event.json";
const FETCH_TIMEOUT_MS = 12_000;

async function getJSON(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** openFDA drug_interactions section (PLR §7) for one drug. Verbatim, citable. */
async function labelInteractions(
  med: Medication,
  now: string,
): Promise<EvidenceObject[]> {
  const query = `${OPENFDA_LABEL}?search=openfda.generic_name:"${encodeURIComponent(med.name)}"&limit=1`;
  const data = await getJSON(query);
  const result = data?.results?.[0];
  if (!result) return [];

  const setId: string = result.set_id ?? "unknown";
  const splUrl = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`;
  const evidence: EvidenceObject[] = [];

  const field =
    result.drug_interactions?.[0] ??
    result.drug_and_or_laboratory_test_interactions?.[0];
  if (field) {
    evidence.push({
      id: `label:${med.rxcui}:interactions`,
      claim_text: `FDA label drug-interactions section for ${med.name}`,
      source_name: "openFDA-label",
      source_id: setId,
      source_url: splUrl,
      exact_field: "drug_interactions",
      quoted_text: field.slice(0, 4000),
      retrieval_query: query,
      retrieved_at: now,
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
      retrieval_query: query,
      retrieved_at: now,
    });
  }
  return evidence;
}

interface DdinterRow {
  drugA: string;
  drugB: string;
  level: string;
  idA: string;
  idB: string;
}

/** Load a local DDInter snapshot (severity per drug pair). CC BY-NC, cited. */
export async function loadDdinter(csvPath: string): Promise<DdinterRow[]> {
  const text = await Bun.file(csvPath).text();
  const lines = text.split("\n").slice(1); // drop header
  const rows: DdinterRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [idA, drugA, idB, drugB, level] = line.split(",");
    if (!drugA || !drugB || !level) continue;
    rows.push({ idA: idA ?? "", drugA, idB: idB ?? "", drugB, level: level.trim() });
  }
  return rows;
}

/** DDInter severity for a specific pair, as an EvidenceObject. */
function ddinterPair(
  a: Medication,
  b: Medication,
  rows: DdinterRow[],
  now: string,
): EvidenceObject | null {
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  const hit = rows.find((r) => {
    const ra = r.drugA.toLowerCase();
    const rb = r.drugB.toLowerCase();
    return (ra === an && rb === bn) || (ra === bn && rb === an);
  });
  if (!hit) return null;
  return {
    id: `ddinter:${hit.idA}:${hit.idB}`,
    claim_text: `DDInter severity for ${a.name} + ${b.name}: ${hit.level}`,
    source_name: "DDInter",
    source_id: `${hit.idA}/${hit.idB}`,
    source_url: "https://ddinter.scbdd.com/",
    exact_field: "Level",
    quoted_text: hit.level,
    retrieval_query: `DDInter pair lookup: ${a.name} x ${b.name}`,
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
  const data = await getJSON(query);
  const total = data?.meta?.results?.total;
  if (typeof total !== "number" || total === 0) return null;
  return {
    id: `faers:${med.rxcui}:${reaction}`,
    claim_text: `${total.toLocaleString()} FAERS reports co-mention ${med.name} and ${reaction} (spontaneous-report signal, not causation)`,
    source_name: "openFDA-FAERS",
    source_id: `faers-count-${total}`,
    source_url: "https://open.fda.gov/apis/drug/event/",
    exact_field: "meta.results.total",
    quoted_text: String(total),
    retrieval_query: query,
    retrieved_at: now,
  };
}

export interface RetrievalResult {
  evidence: EvidenceObject[];
  ddinterRows: DdinterRow[];
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
  const meds = patient.medications.filter((m) => m.rxcui);
  const ddinterRows = await loadDdinter(ddinterCsvPath);
  const evidence: EvidenceObject[] = [];

  // Per-drug: FDA label interactions + boxed warnings.
  for (const med of meds) {
    evidence.push(...(await labelInteractions(med, now)));
  }

  // Per-pair: DDInter severity.
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const ev = ddinterPair(meds[i]!, meds[j]!, ddinterRows, now);
      if (ev) evidence.push(ev);
    }
  }

  // Real-world signal for the anchor drug's key adverse event.
  const warfarin = meds.find((m) => m.name.toLowerCase().includes("warfarin"));
  if (warfarin) {
    const sig = await faersSignal(warfarin, "haemorrhage", now);
    if (sig) evidence.push(sig);
  }

  return { evidence, ddinterRows };
}
