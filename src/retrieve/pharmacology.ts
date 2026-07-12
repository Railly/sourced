import { generateObject, jsonSchema } from "ai";
import type { EvidenceObject, Finding, Medication } from "../types/index.ts";
import type { OpenFdaLabel } from "./index.ts";

/**
 * A source-grounded pharmacology profile for one drug, extracted from its FDA
 * label. This lets Sourced surface a real mechanism (e.g. "amiodarone inhibits
 * CYP2C9 → higher warfarin exposure", or additive QT/anticholinergic burden) by
 * cross-referencing labels, instead of a bare DDInter severity — while every
 * claim still quotes the label that stated it.
 *
 * Extraction is done by a model reading ONLY the label text because a regex
 * cannot tell "warfarin inhibits CYP3A4" from "CYP3A4 inhibitors raise warfarin"
 * — the grammatical role (perpetrator vs victim) is the whole point, and getting
 * it wrong invents dangerous mechanisms. The model is a reader of the supplied
 * source, not a knowledge base; the verbatim quote keeps every claim auditable.
 */
export interface PharmacologyProfile {
  drug: string;
  rxcui: string | null;
  setId: string;
  splUrl: string;
  inhibits: Map<string, string>; // CYP enzyme -> verbatim label quote
  substrateOf: Map<string, string>;
  qtProlonging: string | null; // verbatim quote, or null
  anticholinergic: string | null;
}

const GATEWAY_MODEL = "anthropic/claude-sonnet-5";

/** First label sentence matching `pattern` and not a negation, as a quote. */
function labeledSentence(label: OpenFdaLabel, pattern: RegExp, negation: RegExp): string | null {
  const blocks = [
    ...(label.boxed_warning ?? []),
    ...(label.warnings ?? []),
    ...(label.warnings_and_cautions ?? []),
    ...(label.drug_interactions ?? []),
    ...(label.clinical_pharmacology ?? []),
  ];
  for (const block of blocks) {
    for (const sentence of block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []) {
      const s = sentence.trim();
      if (pattern.test(s) && !negation.test(s.toLowerCase())) return s.slice(0, 400);
    }
  }
  return null;
}

function labelText(label: OpenFdaLabel): string {
  return [
    ...(label.drug_interactions ?? []),
    ...(label.drug_and_or_laboratory_test_interactions ?? []),
    ...(label.clinical_pharmacology ?? []),
    ...(label.boxed_warning ?? []),
    ...(label.warnings ?? []),
    ...(label.warnings_and_cautions ?? []),
  ].join("\n").slice(0, 12_000);
}

const profileSchema = jsonSchema<{
  drugs: Array<{
    drug: string;
    cyp_inhibits: Array<{ enzyme: string; quote: string }>;
    cyp_substrate_of: Array<{ enzyme: string; quote: string }>;
    qt_prolonging: { value: boolean; quote: string };
    anticholinergic: { value: boolean; quote: string };
  }>;
}>({
  type: "object",
  required: ["drugs"],
  additionalProperties: false,
  properties: {
    drugs: {
      type: "array",
      items: {
        type: "object",
        required: ["drug", "cyp_inhibits", "cyp_substrate_of", "qt_prolonging", "anticholinergic"],
        additionalProperties: false,
        properties: {
          drug: { type: "string" },
          cyp_inhibits: {
            type: "array",
            items: { type: "object", required: ["enzyme", "quote"], additionalProperties: false, properties: { enzyme: { type: "string" }, quote: { type: "string" } } },
          },
          cyp_substrate_of: {
            type: "array",
            items: { type: "object", required: ["enzyme", "quote"], additionalProperties: false, properties: { enzyme: { type: "string" }, quote: { type: "string" } } },
          },
          qt_prolonging: { type: "object", required: ["value", "quote"], additionalProperties: false, properties: { value: { type: "boolean" }, quote: { type: "string" } } },
          anticholinergic: { type: "object", required: ["value", "quote"], additionalProperties: false, properties: { value: { type: "boolean" }, quote: { type: "string" } } },
        },
      },
    },
  },
});

const SYSTEM = [
  "You extract a drug's OWN pharmacology strictly from its supplied FDA label text. You are a reader of the provided source, not a knowledge base — never use outside knowledge.",
  "For each drug, report only what its label states ABOUT THAT DRUG. Critically distinguish the drug's own role from statements about OTHER drugs: 'X is a CYP2C9 inhibitor' means X inhibits; 'CYP3A4 inhibitors increase X' or 'X is metabolized by CYP3A4' means X is a SUBSTRATE, not an inhibitor. Getting this backwards is a serious error.",
  "cyp_inhibits: enzymes THIS drug inhibits (normalize as 2C9, 3A4, 1A2, 2D6, etc.). cyp_substrate_of: enzymes THIS drug is a substrate of / metabolized by. qt_prolonging: true only if the label states THIS drug prolongs QT or carries a QT/torsades warning. anticholinergic: true only if the label states THIS drug has anticholinergic activity.",
  "Every entry must include a short VERBATIM quote copied exactly from the supplied label text (no paraphrase). If the label does not support a claim, omit it (empty arrays / value:false with an empty quote).",
].join(" ");

/**
 * Batched, source-bound extraction of pharmacology profiles for the patient's
 * labeled drugs. One model call per review. Returns [] on any failure so the
 * pipeline degrades to DDInter-only rather than breaking.
 */
export async function extractProfiles(
  entries: Array<{ med: Medication; label: OpenFdaLabel }>,
): Promise<PharmacologyProfile[]> {
  if (entries.length === 0) return [];
  const payload = entries.map(({ med, label }) => ({ drug: med.name, label: labelText(label) }));

  let object: { drugs: Array<{ drug: string; cyp_inhibits: Array<{ enzyme: string; quote: string }>; cyp_substrate_of: Array<{ enzyme: string; quote: string }>; qt_prolonging: { value: boolean; quote: string }; anticholinergic: { value: boolean; quote: string } }> };
  try {
    object = (await generateObject({
      model: GATEWAY_MODEL,
      abortSignal: AbortSignal.timeout(55_000),
      schema: profileSchema,
      system: SYSTEM,
      prompt: `Extract the pharmacology profile for each drug from its FDA label text.\n\n${JSON.stringify(payload)}`,
    })).object;
  } catch {
    return [];
  }

  const byDrug = new Map(entries.map(({ med, label }) => [med.name.toLowerCase(), { med, label }]));
  const profiles: PharmacologyProfile[] = [];
  for (const extracted of object.drugs) {
    const entry = byDrug.get(extracted.drug.toLowerCase());
    if (!entry) continue;
    const { med, label } = entry;
    const setId = label.set_id ?? "unknown";
    // Keep claims whose quote is grounded in the supplied label: most of its
    // significant words must appear in the label text (tolerates minor
    // whitespace/punctuation drift in the model's verbatim copy).
    const source = new Set(labelText(label).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const present = (quote: string) => {
      const words = (quote.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
      if (words.length < 3) return false;
      const hits = words.filter((w) => source.has(w)).length;
      return hits / words.length >= 0.7;
    };
    // CYP role assignment needs the model (grammatical role); keep its answer.
    const inhibits = new Map<string, string>();
    for (const item of extracted.cyp_inhibits) if (present(item.quote)) inhibits.set(item.enzyme.toUpperCase().replace(/^CYP/, ""), item.quote);
    const substrateOf = new Map<string, string>();
    for (const item of extracted.cyp_substrate_of) if (present(item.quote)) substrateOf.set(item.enzyme.toUpperCase().replace(/^CYP/, ""), item.quote);
    // QT / anticholinergic presence is detected deterministically from the label
    // (the model is inconsistent at flagging these); a labeled sentence is the quote.
    profiles.push({
      drug: med.name,
      rxcui: med.rxcui,
      setId,
      splUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
      inhibits,
      substrateOf,
      qtProlonging: labeledSentence(label, /(qtc?\b.{0,40}prolong|prolong.{0,40}\bqtc?\b|torsade)/i, /\b(not|no|without|minimal|unlikely)\b.{0,30}(prolong|qt|torsade)/i),
      anticholinergic: labeledSentence(label, /anticholinergic/i, /\b(not|no|without|non-?)\b.{0,15}anticholinergic/i),
    });
  }
  return profiles;
}

/**
 * Cross-references pharmacology profiles across active drugs to produce
 * mechanism-named evidence: CYP inhibitor↔substrate pairs, additive QT
 * prolongation, and additive anticholinergic burden. Deterministic; every
 * evidence object quotes the label sentence that states the mechanism.
 */
export function crossReferencePharmacology(profiles: PharmacologyProfile[], now: string): EvidenceObject[] {
  const evidence: EvidenceObject[] = [];

  // One CYP evidence per ordered pair, listing every shared enzyme, so the
  // synthesis sees a single clean mechanism instead of one row per enzyme.
  for (const a of profiles) {
    for (const b of profiles) {
      if (a.drug.toLowerCase() === b.drug.toLowerCase()) continue;
      const shared: string[] = [];
      let quote = "";
      for (const [enzyme, inhibitQuote] of a.inhibits) {
        if (!b.substrateOf.has(enzyme)) continue;
        shared.push(enzyme);
        if (!quote) quote = inhibitQuote;
      }
      if (shared.length === 0) continue;
      const enzymes = shared.map((e) => `CYP${e}`).join(", ");
      evidence.push({
        id: `cyp:${a.rxcui ?? a.drug}:${b.rxcui ?? b.drug}`,
        claim_text: `${a.drug} inhibits ${enzymes} and ${b.drug} is a substrate of ${shared.length > 1 ? "these enzymes" : enzymes}, so ${a.drug} can raise ${b.drug} exposure`,
        source_name: "openFDA-label",
        source_id: a.setId,
        source_url: a.splUrl,
        exact_field: "clinical_pharmacology",
        quoted_text: quote,
        supporting_text: quote,
        subject_drugs: [a.drug, b.drug],
        retrieval_query: `FDA labels: ${a.drug} inhibits ${enzymes} × ${b.drug} substrate`,
        retrieved_at: now,
      });
    }
  }

  const flagged = (key: "qtProlonging" | "anticholinergic", idPrefix: string, mechanism: (a: string, b: string) => string) => {
    const drugs = profiles.filter((p) => p[key]);
    for (let i = 0; i < drugs.length; i += 1) {
      for (let j = i + 1; j < drugs.length; j += 1) {
        const a = drugs[i]!;
        const b = drugs[j]!;
        evidence.push({
          id: `${idPrefix}:${a.rxcui ?? a.drug}:${b.rxcui ?? b.drug}`,
          claim_text: mechanism(a.drug, b.drug),
          source_name: "openFDA-label",
          source_id: a.setId,
          source_url: a.splUrl,
          exact_field: "warnings",
          quoted_text: a[key]!,
          supporting_text: a[key]!,
          subject_drugs: [a.drug, b.drug],
          retrieval_query: `FDA labels: ${idPrefix} warnings for ${a.drug} and ${b.drug}`,
          retrieved_at: now,
        });
      }
    }
  };

  flagged("qtProlonging", "qt", (a, b) => `${a} and ${b} both carry FDA-labeled QT-prolongation warnings; concurrent use adds QT/torsades risk`);
  flagged("anticholinergic", "anticholinergic", (a, b) => `${a} and ${b} both carry FDA-labeled anticholinergic activity; concurrent use raises anticholinergic burden`);

  return evidence;
}

function drugMatches(needle: string, haystack: string[]): boolean {
  const n = needle.toLowerCase();
  return haystack.some((h) => {
    const hh = h.toLowerCase();
    return hh.includes(n) || n.includes(hh);
  });
}

/**
 * Deterministically upgrades each finding's mechanism using the source-bound
 * pharmacology evidence: when a finding's drug pair matches a CYP/QT/
 * anticholinergic evidence object, its mechanism text is set to the named
 * mechanism and the evidence is cited. This guarantees the real mechanism
 * appears instead of a bare "DDInter classifies the pair as X", without relying
 * on the synthesis model to adopt it.
 */
export function enrichFindingsMechanism(findings: Finding[], evidence: EvidenceObject[]): Finding[] {
  const mechanismEvidence = evidence.filter((item) => /^(cyp|qt|anticholinergic):/.test(item.id));
  if (mechanismEvidence.length === 0) return findings;

  return findings.map((finding) => {
    const match = mechanismEvidence.find((item) => {
      const subjects = item.subject_drugs ?? [];
      return subjects.length === 2 && subjects.every((s) => drugMatches(s, finding.drugs));
    });
    if (!match) return finding;
    const evidence_ids = finding.evidence_ids.includes(match.id)
      ? finding.evidence_ids
      : [...finding.evidence_ids, match.id];
    return { ...finding, mechanism: match.claim_text, evidence_ids };
  });
}
