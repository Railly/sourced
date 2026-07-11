import type { EvidenceObject, Finding, Severity, Status } from "./types";

const SEVERITY_RANK: Record<Severity, number> = {
  major: 0,
  moderate: 1,
  minor: 2,
};

const STATUS_RANK: Record<Status, number> = {
  "red-flag": 0,
  flagged: 1,
  informational: 2,
};

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });
}

export function buildEvidenceMap(evidence: EvidenceObject[]): Map<string, EvidenceObject> {
  return new Map(evidence.map((item) => [item.id, item]));
}

export function uniqueDrugs(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const finding of findings) {
    for (const drug of finding.drugs) {
      const key = drug.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(drug);
      }
    }
  }
  return ordered;
}

function drugTerms(drugs: string[]): string[] {
  return drugs
    .flatMap((drug) => drug.split("/"))
    .map((drug) => drug.trim().toLowerCase())
    .filter(Boolean);
}

export function evidencePassage(evidence: EvidenceObject, drugs: string[]): string | undefined {
  const quote = evidence.quoted_text;
  if (!quote) return undefined;
  if (quote.length <= 700) return quote;

  const anchor = evidence.claim_text.match(/\bfor\s+(.+)$/i)?.[1]?.toLowerCase();
  const terms = drugTerms(drugs).filter(
    (term) => !anchor || (!anchor.includes(term) && !term.includes(anchor)),
  );
  const lowered = quote.toLowerCase();
  const indexes = terms.flatMap((term) => {
    const index = lowered.indexOf(term);
    return index >= 0 ? [{ term, index }] : [];
  });
  const best = indexes.sort((left, right) => left.index - right.index)[0];
  if (!best) {
    return evidence.supporting_text && evidence.supporting_text.length >= 120
      ? evidence.supporting_text
      : quote.slice(0, 500);
  }

  const sentenceStart = Math.max(0, quote.lastIndexOf(". ", best.index) + 2);
  let sentenceEnd = best.index;
  for (let count = 0; count < 3; count += 1) {
    const boundary = quote.indexOf(". ", sentenceEnd + 1);
    if (boundary < 0) {
      sentenceEnd = quote.length;
      break;
    }
    sentenceEnd = boundary + 1;
  }
  if (sentenceEnd - sentenceStart <= 620) {
    return quote.slice(sentenceStart, sentenceEnd).trim();
  }

  const start = Math.max(0, best.index - 80);
  const end = Math.min(quote.length, start + 500);
  const leadingBoundary = start === 0 ? 0 : quote.indexOf(" ", start);
  const trailingBoundary = end === quote.length ? end : quote.lastIndexOf(" ", end);
  const excerpt = quote.slice(Math.max(0, leadingBoundary), trailingBoundary).trim();
  return `${leadingBoundary > 0 ? "…" : ""}${excerpt}${trailingBoundary < quote.length ? "…" : ""}`;
}
