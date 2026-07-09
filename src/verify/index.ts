import type { EvidenceObject, Finding, SafetyReport } from "../types/index.ts";

function findingClaimText(finding: Finding): string {
  return finding.headline || finding.mechanism || finding.drugs.join(" + ") || "untitled finding";
}

export function verify(report: SafetyReport, evidence: EvidenceObject[]): SafetyReport {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const findings: Finding[] = [];
  const unverifiedRemoved = [...report.unverified_removed];

  for (const finding of report.findings) {
    if (finding.evidence_ids.length === 0) {
      unverifiedRemoved.push({
        claim_text: findingClaimText(finding),
        reason: "Finding has no evidence_ids.",
      });
      continue;
    }

    const missing = finding.evidence_ids.filter((id) => !evidenceById.has(id));
    if (missing.length > 0) {
      unverifiedRemoved.push({
        claim_text: findingClaimText(finding),
        reason: `Unresolved evidence_id(s): ${missing.join(", ")}.`,
      });
      continue;
    }

    findings.push({
      ...finding,
      evidence_ids: [...new Set(finding.evidence_ids)],
    });
  }

  return {
    ...report,
    findings,
    evidence,
    unverified_removed: unverifiedRemoved,
  };
}
