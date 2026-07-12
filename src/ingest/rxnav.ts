import type { Medication, MedicationStatus } from "../types/index.ts";
import { getCachedRxNav, isRxNavOffline, putCachedRxNav } from "./rxnav-cache.ts";

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

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      conceptProperties?: Array<{ rxcui: string; name: string }>;
    }>;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const cached = getCachedRxNav(url);
  if (cached !== undefined) return cached as T;
  if (isRxNavOffline()) throw new Error(`RxNav offline: uncached request ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`RxNav request failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as T;
    putCachedRxNav(url, json);
    return json;
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
  cleaned = cleaned.replace(/,\s*total\s+of\b/gi, " ");
  cleaned = cleaned.replace(/\btotal\s+of\b/gi, " ");
  cleaned = cleaned.replace(/\b\d{1,3}(?:,\d{3})+\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/gi, " ");
  cleaned = cleaned.replace(/\bby\s+mouth\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:once|twice|three times|four times)\s+(?:a|per)\s+day\b/gi, " ");
  cleaned = cleaned.replace(/\bevery\s+\d+\s*(?:hours?|hrs?)\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:daily|bid|tid|qid|qhs|prn|iv|po|oral|dose pack)\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:tablet|capsule|syrup|solution|injection)s?\b/gi, " ");
  cleaned = cleaned.replace(/[,;]+/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function sourceDeclaredIngredientTerms(raw: string): string[] {
  const terms: string[] = [];
  for (const match of raw.matchAll(/\(([^)]*)\)/g)) {
    const group = match[1] ?? "";
    const parts = group.split(",");
    if (parts.length < 2 || !/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)/i.test(group)) continue;
    for (const part of parts) {
      const term = extractDrugName(part)
        .replace(/\bper\b.*$/i, "")
        .trim();
      if (/^[a-z][a-z -]{2,}$/i.test(term)) terms.push(term);
    }
  }
  return [...new Set(terms.map((term) => term.toLowerCase()))];
}

async function fetchRxNormName(rxcui: string): Promise<string | null> {
  const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/property.json?propName=RxNorm%20Name`;
  const data = await fetchJson<PropertyResponse>(url);
  const value = data.propConceptGroup?.propConcept?.[0]?.propValue;
  return value ?? null;
}

async function fetchIngredients(rxcui: string): Promise<{ rxcui: string; name: string }[]> {
  const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`;
  const data = await fetchJson<RelatedResponse>(url);
  const ingredients =
    data.relatedGroup?.conceptGroup?.flatMap((group) => group.conceptProperties ?? []) ?? [];
  return [
    ...new Map(
      ingredients.map((ingredient) => [
        ingredient.rxcui,
        { rxcui: ingredient.rxcui, name: ingredient.name },
      ]),
    ).values(),
  ];
}

async function attachIngredients(
  raw: string,
  result: { rxcui: string; name: string },
  resolution: "exact" | "approximate",
  chronology: MedicationChronology,
  declaredIngredients: { rxcui: string; name: string }[],
): Promise<Medication> {
  try {
    const ingredients = [
      ...new Map(
        [...await fetchIngredients(result.rxcui), ...declaredIngredients].map((ingredient) => [
          ingredient.rxcui,
          ingredient,
        ]),
      ).values(),
    ];
    return { raw, ...result, resolution, ingredients, ...chronologyFields(chronology) };
  } catch {
    return {
      raw,
      ...result,
      resolution,
      ...(declaredIngredients.length > 0 ? { ingredients: declaredIngredients } : {}),
      ...chronologyFields(chronology),
    };
  }
}

interface MedicationChronology {
  status?: MedicationStatus;
  episode?: string;
  start?: string;
  end?: string;
  source_span?: string;
}

function chronologyFields(chronology: MedicationChronology): Pick<
  Medication,
  "status" | "episode" | "start" | "end" | "source_span"
> {
  return {
    status: chronology.status ?? "active",
    ...(chronology.episode ? { episode: chronology.episode } : {}),
    ...(chronology.start ? { start: chronology.start } : {}),
    ...(chronology.end ? { end: chronology.end } : {}),
    ...(chronology.source_span ? { source_span: chronology.source_span } : {}),
  };
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

/**
 * A trusted approximate match shares a real word stem with the search term.
 * RxNav's approximateTerm will otherwise fuzzy-map free text to unrelated
 * branded products (e.g. "phytonadione" → "By Ache", "antiretroviral regimen"
 * → "Anacin Aspirin Regimen"), which is a dangerous false medication in a
 * safety tool. This still accepts cross-language stems like amiodarona ↔
 * amiodarone (shared "amiodaron" prefix). Common formulation words are ignored
 * so a shared "regimen"/"tablet" alone never validates a match.
 */
const STEM_STOPWORDS = new Set([
  "regimen", "tablet", "tablets", "capsule", "capsules", "solution", "oral",
  "pill", "pills", "brand", "extended", "release", "combination", "new",
]);

function tokenStems(value: string): string[] {
  return (value.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((token) => !STEM_STOPWORDS.has(token));
}

function sharesStem(term: string, candidateName: string): boolean {
  const candidateTokens = tokenStems(candidateName);
  return tokenStems(term).some((termToken) =>
    candidateTokens.some((candidateToken) => {
      const shorter = Math.min(termToken.length, candidateToken.length);
      const prefix = Math.min(shorter, 5);
      return termToken.slice(0, prefix) === candidateToken.slice(0, prefix) && shorter >= 5;
    }),
  );
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

  // Reject fuzzy matches that don't share a drug-name stem with the query.
  if (!sharesStem(term, name)) return null;

  return { rxcui: candidate.rxcui, name };
}

async function resolveDeclaredIngredients(raw: string): Promise<{ rxcui: string; name: string }[]> {
  const resolved = await Promise.all(
    sourceDeclaredIngredientTerms(raw).map(async (term) => {
      try {
        return (await tryExactMatch(term)) ?? (await tryApproximateMatch(term));
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter((item): item is { rxcui: string; name: string } => Boolean(item));
}

/**
 * Resolves a single raw medication line against RxNav. Never throws for a
 * single-drug failure: network errors and unresolved lookups both collapse
 * to `resolution: "unresolved", rxcui: null` so one bad drug never aborts
 * the whole ingest.
 */
export async function normalizeMedication(
  raw: string,
  chronology: MedicationChronology = { status: "active" },
): Promise<Medication> {
  const extracted = extractDrugName(raw);
  const searchTerm = KNOWN_ALIASES[extracted.toLowerCase()] ?? extracted;
  const declaredIngredients = await resolveDeclaredIngredients(raw);

  try {
    const exact = await tryExactMatch(searchTerm);
    if (exact) {
      return attachIngredients(raw, exact, "exact", chronology, declaredIngredients);
    }

    const approximate = await tryApproximateMatch(searchTerm);
    if (approximate) {
      return attachIngredients(raw, approximate, "approximate", chronology, declaredIngredients);
    }

    return {
      raw,
      name: extracted,
      rxcui: null,
      resolution: "unresolved",
      ...(declaredIngredients.length > 0 ? { ingredients: declaredIngredients } : {}),
      ...chronologyFields(chronology),
    };
  } catch {
    return {
      raw,
      name: extracted,
      rxcui: null,
      resolution: "unresolved",
      ...(declaredIngredients.length > 0 ? { ingredients: declaredIngredients } : {}),
      ...chronologyFields(chronology),
    };
  }
}
