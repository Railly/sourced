import type { Medication } from "../types/index.ts";

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * approximateTerm.json returns an unbounded relevance score (observed range
 * ~2-17 for real drugs, same range for garbage input — RxNav already drops
 * non-matches as an empty candidate list rather than scoring them low).
 * Score alone is not a trustworthy confidence signal here, so this floor
 * only rejects the degenerate tail (e.g. single-letter noise); the real
 * gate is "did RxNav return a candidate at all".
 */
const APPROXIMATE_SCORE_FLOOR = 4;

/**
 * Spanish/LATAM colloquial names for combination drugs that RxNav's search
 * index does not recognize in their single-word Spanish form. Verified by
 * hand: "cotrimoxazol" (no space) resolves to nothing in RxNav (neither
 * rxcui.json nor approximateTerm.json); "sulfamethoxazole trimethoprim"
 * resolves exact to rxcui 10831. This is a documented synonym table, not a
 * guess at an rxcui.
 */
const KNOWN_ALIASES: Record<string, string> = {
  cotrimoxazol: "sulfamethoxazole trimethoprim",
};

interface RxcuiExactResponse {
  idGroup?: {
    rxnormId?: string[];
  };
}

interface ApproximateCandidate {
  rxcui: string;
  score: string;
  rank: string;
  name?: string;
}

interface ApproximateTermResponse {
  approximateGroup?: {
    candidate?: ApproximateCandidate[];
  };
}

interface PropertyResponse {
  propConceptGroup?: {
    propConcept?: { propName: string; propValue: string }[];
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`RxNav request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Strips dose strings, ratios, and parenthetical notes from a raw med line
 * so the drug name is isolated before querying RxNav.
 *
 * Examples:
 *   "amiodarona 200mg" -> "amiodarona"
 *   "cotrimoxazol 800/160mg" -> "cotrimoxazol"
 *   "Coumadin (reconciliar duplicidad?)" -> "Coumadin"
 */
export function extractDrugName(raw: string): string {
  let cleaned = raw;
  cleaned = cleaned.replace(/\([^)]*\)/g, " ");
  cleaned = cleaned.replace(/\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

async function fetchRxNormName(rxcui: string): Promise<string | null> {
  const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/property.json?propName=RxNorm%20Name`;
  const data = await fetchJson<PropertyResponse>(url);
  const value = data.propConceptGroup?.propConcept?.[0]?.propValue;
  return value ?? null;
}

async function tryExactMatch(term: string): Promise<{ rxcui: string; name: string } | null> {
  const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(term)}&search=2`;
  const data = await fetchJson<RxcuiExactResponse>(url);
  const rxcui = data.idGroup?.rxnormId?.[0];
  if (!rxcui) return null;
  const name = await fetchRxNormName(rxcui);
  if (!name) return null;
  return { rxcui, name };
}

async function tryApproximateMatch(term: string): Promise<{ rxcui: string; name: string } | null> {
  const url = `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=1`;
  const data = await fetchJson<ApproximateTermResponse>(url);
  const candidate = data.approximateGroup?.candidate?.[0];
  if (!candidate) return null;

  const score = Number.parseFloat(candidate.score);
  if (!Number.isFinite(score) || score < APPROXIMATE_SCORE_FLOOR) return null;

  const name = candidate.name ?? (await fetchRxNormName(candidate.rxcui));
  if (!name) return null;

  return { rxcui: candidate.rxcui, name };
}

/**
 * Resolves a single raw medication line against RxNav. Never throws for a
 * single-drug failure: network errors and unresolved lookups both collapse
 * to `resolution: "unresolved", rxcui: null` so one bad drug never aborts
 * the whole ingest.
 */
export async function normalizeMedication(raw: string): Promise<Medication> {
  const extracted = extractDrugName(raw);
  const searchTerm = KNOWN_ALIASES[extracted.toLowerCase()] ?? extracted;

  try {
    const exact = await tryExactMatch(searchTerm);
    if (exact) {
      return { raw, name: exact.name, rxcui: exact.rxcui, resolution: "exact" };
    }

    const approximate = await tryApproximateMatch(searchTerm);
    if (approximate) {
      return { raw, name: approximate.name, rxcui: approximate.rxcui, resolution: "approximate" };
    }

    return { raw, name: extracted, rxcui: null, resolution: "unresolved" };
  } catch {
    return { raw, name: extracted, rxcui: null, resolution: "unresolved" };
  }
}
