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
