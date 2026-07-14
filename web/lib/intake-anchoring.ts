import type { IntakeExtraction } from "@/lib/intake";

export interface SourceMedicationCandidate {
  name: string;
  excerpt: string;
  offset: number;
}

export interface IntakeAnchorValidation {
  ok: boolean;
  issues: string[];
  missingCandidates: SourceMedicationCandidate[];
}

const exposurePattern = /\b(received|given|started|taking|takes|maintenance|administered|prescribed|prescription|treated|therapy|infused|infusion|using|dose|daily|twice|once|intravenous|oral|tablet|capsule|injection|discharged|medications|included)\b/i;
const sentinelPattern = /^(?:placeholder|unknown|tbd|n\/?a|not applicable|not specified|medication|drug)$/i;
const identityStopwords = new Set([
  "with",
  "from",
  "daily",
  "tablet",
  "capsule",
  "solution",
  "injection",
  "intravenous",
  "oral",
  "maintenance",
  "regimen",
  "medication",
  "therapy",
  "treatment",
  "extended",
  "release",
  "once",
  "twice",
  "times",
  "every",
]);
const acronymStopwords = new Set(["iv", "im", "po", "od", "bd", "bid", "tid", "qid", "hs", "prn", "subq"]);

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function excerptAt(source: string, offset: number, length: number): string {
  const boundaries = ["\n", ".", "!", "?", ";"];
  let start = 0;
  for (const boundary of boundaries) {
    start = Math.max(start, source.lastIndexOf(boundary, Math.max(0, offset - 1)) + 1);
  }
  let end = source.length;
  for (const boundary of boundaries) {
    const found = source.indexOf(boundary, offset + length);
    if (found >= 0) end = Math.min(end, found + 1);
  }
  const excerpt = source.slice(start, end).trim();
  return excerpt.length <= 500 ? excerpt : source.slice(Math.max(0, offset - 180), offset + length + 260).trim().slice(0, 500);
}

function candidateOccurrence(source: string, name: string): SourceMedicationCandidate | null {
  const lowerSource = source.toLowerCase();
  const lowerName = name.toLowerCase();
  let offset = lowerSource.indexOf(lowerName);
  while (offset >= 0) {
    const before = source[offset - 1];
    const after = source[offset + name.length];
    if (!wordCharacter(before) && !wordCharacter(after)) {
      const excerpt = excerptAt(source, offset, name.length);
      if (offset < 800 || exposurePattern.test(excerpt)) return { name, excerpt, offset };
    }
    offset = lowerSource.indexOf(lowerName, offset + lowerName.length);
  }
  // Cross-language / ortographic fallback: the extractor normalizes drug names
  // to their canonical (usually English) form, but the source may spell them in
  // another language (e.g. "tizanidine" vs Spanish "tizanidina"). Anchor on a
  // shared stem (first 6+ letters, at a word boundary) so the med still traces
  // to the source without weakening the "must appear in source" guarantee.
  const stem = lowerName.replace(/[^a-z]/g, "").slice(0, Math.max(6, Math.floor(lowerName.length * 0.7)));
  if (stem.length >= 6) {
    let stemOffset = lowerSource.indexOf(stem);
    while (stemOffset >= 0) {
      const before = source[stemOffset - 1];
      if (!wordCharacter(before)) {
        // Extend to the end of the source word to quote it as written.
        let end = stemOffset + stem.length;
        while (end < source.length && wordCharacter(source[end])) end += 1;
        const excerpt = excerptAt(source, stemOffset, end - stemOffset);
        if (stemOffset < 800 || exposurePattern.test(excerpt)) return { name, excerpt, offset: stemOffset };
      }
      stemOffset = lowerSource.indexOf(stem, stemOffset + stem.length);
    }
  }
  return null;
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function coordinatedCandidateOccurrences(
  source: string,
  drugNames: readonly string[],
  exactCandidates: readonly SourceMedicationCandidate[],
): SourceMedicationCandidate[] {
  const twoTokenNames = drugNames.flatMap((name) => {
    const trimmed = name.trim();
    const tokens = normalizeText(trimmed).split(" ");
    return tokens.length === 2 ? [{ name: trimmed, head: tokens[0], tail: tokens[1] }] : [];
  });
  const candidates: SourceMedicationCandidate[] = [];
  for (const exact of exactCandidates) {
    const exactTokens = normalizeText(exact.name).split(" ");
    if (exactTokens.length !== 2) continue;
    for (const sibling of twoTokenNames) {
      if (sibling.head !== exactTokens[0] || sibling.tail === exactTokens[1]) continue;
      const pattern = new RegExp(
        `\\b${escapedPattern(exact.name)}\\s+(?:and|or|/)\\s+${escapedPattern(sibling.tail)}\\b`,
        "i",
      );
      const match = pattern.exec(source);
      if (!match || match.index === undefined) continue;
      candidates.push({
        name: sibling.name,
        excerpt: excerptAt(source, match.index, match[0].length),
        offset: match.index + match[0].toLowerCase().lastIndexOf(sibling.tail.toLowerCase()),
      });
    }
  }
  return candidates;
}

function firstPatientScope(source: string): string {
  const matches = [
    ...source.matchAll(/\bcase\s*(?:no\.?|number|#)\s*(\d{1,3})\b/gi),
    ...source.matchAll(/^\s*case\s+(\d{1,3})\b/gim),
    ...source.matchAll(/^\s*patient\s+(\d{1,3})\b/gim),
  ]
    .filter((match) => match.index !== undefined && match[1])
    .sort((left, right) => left.index! - right.index!);
  const firstNumber = matches[0]?.[1];
  if (!firstNumber) return source;
  const nextPatient = matches.find((match) => match[1] !== firstNumber);
  return nextPatient?.index === undefined ? source : source.slice(0, nextPatient.index);
}

export function extractSourceMedicationCandidates(
  source: string,
  drugNames: readonly string[],
  limit = 32,
  minimumNameLength = 4,
): SourceMedicationCandidate[] {
  const scopedSource = firstPatientScope(source);
  const candidates = new Map<string, SourceMedicationCandidate>();
  for (const drugName of drugNames) {
    const name = drugName.trim();
    if (name.length < minimumNameLength) continue;
    const candidate = candidateOccurrence(scopedSource, name);
    if (!candidate) continue;
    const key = normalizeText(name);
    const current = candidates.get(key);
    if (!current || candidate.offset < current.offset) candidates.set(key, candidate);
  }
  for (const candidate of coordinatedCandidateOccurrences(scopedSource, drugNames, [...candidates.values()])) {
    const key = normalizeText(candidate.name);
    if (!candidates.has(key)) candidates.set(key, candidate);
  }
  return [...candidates.values()].sort((left, right) => left.offset - right.offset).slice(0, limit);
}

function acronymIdentityTokens(raw: string): string[] {
  return [...raw.matchAll(/\b[A-Z][A-Z0-9]{1,7}\b/g)]
    .map((match) => match[0].toLowerCase())
    .filter((token) => !acronymStopwords.has(token));
}

function identityTokens(raw: string): string[] {
  const words = normalizeText(raw)
    .split(" ")
    .filter((token) => token.length >= 4 && !identityStopwords.has(token));
  return [...new Set([...acronymIdentityTokens(raw), ...words])];
}

function requiredSourceTokens(raw: string): string[] {
  const acronyms = acronymIdentityTokens(raw);
  return acronyms.length > 0 ? acronyms : identityTokens(raw);
}

function literalIdentityPhrases(raw: string): string[] {
  const full = raw.trim();
  const head = full.split(/\s*[;(]/, 1)[0]?.trim() ?? "";
  return [...new Set([full, head].filter((value) => value.length >= 2))];
}

function sourceSegments(source: string): string[] {
  return [...source.matchAll(/[^.!?;\n]+(?:[.!?;]|$)/g)]
    .map((match) => match[0].trim())
    .filter((segment) => segment.length > 0 && segment.length <= 500);
}

function sourceSpanForMedication(source: string, raw: string): string | null {
  const scopedSource = firstPatientScope(source);
  const tokens = requiredSourceTokens(raw);
  if (tokens.length === 0) return null;
  const matches = sourceSegments(scopedSource).filter((segment) => {
    const normalized = normalizeText(segment);
    return tokens.every((token) => normalized.includes(token));
  });
  const segment = matches.sort((left, right) => left.length - right.length)[0];
  if (segment) return segment;
  for (const phrase of literalIdentityPhrases(raw)) {
    const literal = new RegExp(`\\b${escapedPattern(phrase)}\\b`, "i").exec(scopedSource);
    if (literal?.index !== undefined) {
      return scopedSource.slice(literal.index, literal.index + literal[0].length);
    }
  }
  return null;
}

export function repairCoordinatedMedicationIdentities(
  source: string,
  extraction: IntakeExtraction,
  candidates: readonly SourceMedicationCandidate[],
): IntakeExtraction {
  const scopedSource = firstPatientScope(source);
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: extraction.case.medications.map((medication) => {
        const raw = normalizeText(medication.raw);
        const matches = candidates.filter((candidate) => {
          const candidateTokens = normalizeText(candidate.name).split(" ");
          if (candidateTokens.length !== 2 || raw !== candidateTokens[1]) return false;
          const pattern = new RegExp(
            `\\b${escapedPattern(candidateTokens[0])}\\s+[a-z0-9]+\\s+(?:and|or|/)\\s+${escapedPattern(candidateTokens[1])}\\b`,
            "i",
          );
          return pattern.test(scopedSource);
        });
        return matches.length === 1 ? { ...medication, raw: matches[0]!.name } : medication;
      }),
    },
  };
}

export function repairExplicitOneTimeMedicationCandidates(
  extraction: IntakeExtraction,
  candidates: readonly SourceMedicationCandidate[],
): IntakeExtraction {
  const existingRaw = extraction.case.medications.map((medication) => normalizeText(medication.raw));
  const explicitOneTimePattern = /\b(challenge|challenges|rescue|reversal|emergency department|treatment dose|doses? of)\b/i;
  const hypotheticalPattern = /\b(offered|planned|future|avoid|should this medication|clinically indicated)\b/i;
  const additions = candidates.flatMap((candidate) => {
    const normalizedName = normalizeText(candidate.name);
    if (existingRaw.some((raw) => raw.includes(normalizedName))) return [];
    if (!explicitOneTimePattern.test(candidate.excerpt) || hypotheticalPattern.test(candidate.excerpt)) return [];
    return [{ raw: candidate.name, status: "one-time" as const, source_span: candidate.excerpt }];
  });
  if (additions.length === 0) return extraction;
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: [...extraction.case.medications, ...additions],
    },
  };
}

export function repairExplicitActiveMedicationCandidates(
  source: string,
  extraction: IntakeExtraction,
  candidates: readonly SourceMedicationCandidate[],
): IntakeExtraction {
  const existingRaw = extraction.case.medications.map((medication) => normalizeText(medication.raw));
  const explicitActivePattern = /\b(following introduction of|concomitantly with|started on|started|taking|maintenance|prescribed|treatment with|received|administered)\b/i;
  const historicalPattern = /\b(previously|prior|historical|former|later|stopped|discontinued|held|offered|planned|future)\b/i;
  const scopedSource = firstPatientScope(source);
  const additions = candidates.flatMap((candidate) => {
    const normalizedName = normalizeText(candidate.name);
    if (existingRaw.some((raw) => raw.includes(normalizedName))) return [];
    const exposureSpan = sourceSegments(scopedSource).find((segment) => {
      const normalized = normalizeText(segment);
      return normalized.includes(normalizedName)
        && explicitActivePattern.test(segment)
        && !historicalPattern.test(segment);
    });
    return exposureSpan
      ? [{ raw: candidate.name, status: "active" as const, source_span: exposureSpan }]
      : [];
  });
  if (additions.length === 0) return extraction;
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: [...extraction.case.medications, ...additions],
    },
  };
}

export function repairMedicationSourceSpans(
  source: string,
  extraction: IntakeExtraction,
): IntakeExtraction {
  const normalizedSource = normalizeText(firstPatientScope(source));
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: extraction.case.medications.map((medication) => {
        const sourceSpan = medication.source_span?.trim();
        const normalizedSpan = normalizeText(sourceSpan ?? "");
        const tokens = requiredSourceTokens(medication.raw);
        const currentIsAnchored = normalizedSpan.length > 0
          && normalizedSource.includes(normalizedSpan)
          && tokens.some((token) => normalizedSpan.includes(token));
        if (currentIsAnchored) return medication;
        const repaired = sourceSpanForMedication(source, medication.raw);
        return repaired ? { ...medication, source_span: repaired } : medication;
      }),
    },
  };
}

export function repairSourceSummary(source: string, extraction: IntakeExtraction): IntakeExtraction {
  if (extraction.sourceSummary.trim()) return extraction;
  const sourceSummary = firstPatientScope(source)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 10)
    ?.slice(0, 500) ?? firstPatientScope(source).trim().slice(0, 500);
  return { ...extraction, sourceSummary };
}

export function repairConservativeActiveStatuses(
  source: string,
  extraction: IntakeExtraction,
): IntakeExtraction {
  const activeExposurePattern = /\b(started on|discharged on|prescription of|prescribed|taking|maintenance)\b/i;
  const historicalPattern = /\b(previously|prior|history|historical|former|ago|before|stopped|discontinued|held)\b/i;
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: extraction.case.medications.map((medication) => {
        if (medication.status === "active" || medication.status === "indirect-exposure") return medication;
        const tokens = identityTokens(medication.raw);
        const medicationSegments = sourceSegments(firstPatientScope(source)).filter((segment) => {
          const normalized = normalizeText(segment);
          return tokens.length > 0 && tokens.every((token) => normalized.includes(token));
        });
        if (medicationSegments.some((segment) => historicalPattern.test(segment))) return medication;
        const exposureSpan = sourceSpanForMedication(source, medication.raw);
        if (!exposureSpan || !activeExposurePattern.test(exposureSpan) || historicalPattern.test(exposureSpan)) {
          return medication;
        }
        return { ...medication, status: "active", source_span: exposureSpan };
      }),
    },
  };
}

export function repairIndirectExposureStatuses(
  source: string,
  extraction: IntakeExtraction,
): IntakeExtraction {
  const indirectPattern = /\b(indirect exposure|allergy by proxy|child(?:'s|ren)|household|traces of)\b/i;
  return {
    ...extraction,
    case: {
      ...extraction.case,
      medications: extraction.case.medications.map((medication) => {
        const scopedSource = firstPatientScope(source);
        const identity = literalIdentityPhrases(medication.raw).at(-1) ?? medication.raw;
        const tokens = requiredSourceTokens(identity);
        const indirectSpan = sourceSegments(scopedSource).find((segment) => {
          const normalized = normalizeText(segment);
          return tokens.length > 0
            && tokens.every((token) => normalized.includes(token))
            && indirectPattern.test(segment);
        }) ?? literalIdentityPhrases(medication.raw).flatMap((phrase) => {
          const matches: string[] = [];
          const pattern = new RegExp(`\\b${escapedPattern(phrase)}\\b`, "gi");
          for (const match of scopedSource.matchAll(pattern)) {
            if (match.index !== undefined) matches.push(excerptAt(scopedSource, match.index, match[0].length));
          }
          return matches;
        }).find((excerpt) => indirectPattern.test(excerpt));
        return indirectSpan
          ? { ...medication, status: "indirect-exposure", source_span: indirectSpan }
          : medication;
      }),
    },
  };
}

export function validateSourceAnchoredIntake(
  source: string,
  extraction: IntakeExtraction,
  candidates: readonly SourceMedicationCandidate[],
): IntakeAnchorValidation {
  const issues: string[] = [];
  const normalizedSource = normalizeText(firstPatientScope(source));
  const validatedMedicationRaw: string[] = [];
  for (const medication of extraction.case.medications) {
    if (sentinelPattern.test(normalizeText(medication.raw))) {
      issues.push(`Sentinel medication is not allowed: ${medication.raw}`);
      continue;
    }
    const sourceSpan = medication.source_span?.trim();
    if (!sourceSpan) {
      issues.push(`Medication is missing source_span: ${medication.raw}`);
      continue;
    }
    const normalizedSpan = normalizeText(sourceSpan);
    if (!normalizedSpan || !normalizedSource.includes(normalizedSpan)) {
      issues.push(`Medication source_span is not verbatim source text: ${medication.raw}`);
      continue;
    }
    const tokens = identityTokens(medication.raw);
    const normalizedRaw = normalizeText(medication.raw);
    const rawIsVerbatim = normalizedRaw.length > 0 && normalizedSource.includes(normalizedRaw);
    if (tokens.length === 0 || (!rawIsVerbatim && !tokens.some((token) => normalizedSpan.includes(token)))) {
      issues.push(`Medication identity is not anchored by source_span: ${medication.raw}`);
      continue;
    }
    validatedMedicationRaw.push(medication.raw);
  }

  const medicationEvidence = validatedMedicationRaw.map((raw) => normalizeText(raw));
  // A source candidate is covered when a validated med contains its name, OR
  // shares its stem (first 6+ letters). The stem check tolerates the extractor
  // normalizing a drug to its canonical form ("tizanidine") while the source
  // spells it in another language ("tizanidina") — same drug, same evidence.
  const sharesStem = (raw: string, candidateName: string): boolean => {
    const name = normalizeText(candidateName).replace(/[^a-z]/g, "");
    if (name.length < 6) return raw.includes(name);
    const stem = name.slice(0, Math.max(6, Math.floor(name.length * 0.7)));
    return raw.replace(/[^a-z]/g, "").includes(stem);
  };
  const missingCandidates = candidates.filter(
    (candidate) => !medicationEvidence.some((raw) => raw.includes(normalizeText(candidate.name)) || sharesStem(raw, candidate.name)),
  );
  if (missingCandidates.length > 0) {
    issues.push(`Missing source medication candidates: ${missingCandidates.map((candidate) => candidate.name).join(", ")}`);
  }
  return { ok: issues.length === 0, issues, missingCandidates };
}

export function formatMedicationCandidates(candidates: readonly SourceMedicationCandidate[]): string {
  if (candidates.length === 0) return "No exact DDInter medication strings were detected in exposure contexts.";
  return candidates.map((candidate) => `- ${candidate.name}: ${candidate.excerpt}`).join("\n");
}
