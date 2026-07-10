import { callOpus, parseJsonObject } from "../llm.ts";
import type { EvidenceObject, Finding, SafetyReport } from "../types/index.ts";

function findingClaimText(finding: Finding): string {
  return finding.headline || finding.mechanism || finding.drugs.join(" + ") || "untitled finding";
}

// ---- Level 1: deterministic citation resolution ----

interface Level1Result {
  survivors: Finding[];
  removed: SafetyReport["unverified_removed"];
}

function level1(report: SafetyReport, evidence: EvidenceObject[]): Level1Result {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const survivors: Finding[] = [];
  const removed: SafetyReport["unverified_removed"] = [...report.unverified_removed];

  for (const finding of report.findings) {
    if (finding.evidence_ids.length === 0) {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: "Finding has no evidence_ids.",
      });
      continue;
    }
    const missing = finding.evidence_ids.filter((id) => !evidenceById.has(id));
    if (missing.length > 0) {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: `Unresolved evidence_id(s): ${missing.join(", ")}.`,
      });
      continue;
    }
    survivors.push({
      ...finding,
      evidence_ids: [...new Set(finding.evidence_ids)],
    });
  }
  return { survivors, removed };
}

// ---- Level 2: adversarial claim-vs-source review ----
// This is the reviewer agent. It catches the real, dangerous failure: a finding
// that cites a valid evidence object but asserts something that object does not say.

const level2Schema = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "unsupported_claims"],
  properties: {
    supported: { type: "boolean" },
    unsupported_claims: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const LEVEL2_SYSTEM = [
  "You are the adversarial VERIFIER for Sourced, a medication-safety tool.",
  "You are given ONE finding and the verbatim quoted text of the sources it cites.",
  "Your only job: decide whether EVERY clinical assertion in the finding (severity, mechanism, interaction, monitoring action, dose change, adverse effect) is directly supported by the quoted source text.",
  "Do NOT use outside medical knowledge. If a claim is medically true but NOT present in the quoted text, it is UNSUPPORTED.",
  "Be strict: a specific number, dose, severity level, or monitoring instruction must appear in or be directly entailed by the quoted text.",
  "Return supported=true only if nothing in the finding goes beyond the sources. List every unsupported assertion in unsupported_claims.",
  "Return only JSON matching the schema. No markdown.",
].join("\n");

export interface Level2Verdict {
  supported: boolean;
  unsupported_claims: string[];
}

function buildLevel2User(finding: Finding, evidence: EvidenceObject[]): string {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const citedSources = finding.evidence_ids.map((id) => {
    const e = evidenceById.get(id);
    return {
      evidence_id: id,
      source: e?.source_name,
      quoted_text: e?.quoted_text ?? "(no quoted text on this evidence object)",
    };
  });
  return JSON.stringify(
    {
      finding: {
        headline: finding.headline,
        severity: finding.severity,
        mechanism: finding.mechanism,
        monitoring: finding.monitoring ?? null,
        drugs: finding.drugs,
      },
      cited_sources: citedSources,
    },
    null,
    2,
  );
}

async function level2Check(finding: Finding, evidence: EvidenceObject[]): Promise<Level2Verdict> {
  const raw = await callOpus(LEVEL2_SYSTEM, buildLevel2User(finding, evidence), level2Schema);
  const parsed = parseJsonObject(raw) as Record<string, unknown>;
  const supported = parsed.supported === true;
  const unsupported = Array.isArray(parsed.unsupported_claims)
    ? parsed.unsupported_claims.filter((c): c is string => typeof c === "string")
    : [];
  return { supported, unsupported_claims: unsupported };
}

export interface VerifyOptions {
  /** Run the adversarial claim-vs-source pass. Default true. */
  adversarial?: boolean;
  reviewer?: (finding: Finding, evidence: EvidenceObject[]) => Promise<Level2Verdict>;
}

export async function verify(
  report: SafetyReport,
  evidence: EvidenceObject[],
  options: VerifyOptions = {},
): Promise<SafetyReport> {
  const adversarial = options.adversarial ?? true;
  const reviewer = options.reviewer ?? level2Check;
  const { survivors, removed } = level1(report, evidence);

  if (!adversarial) {
    return {
      ...report,
      findings: survivors,
      evidence,
      unverified_removed: removed,
    };
  }

  const findings: Finding[] = [];
  for (const finding of survivors) {
    let verdict: Level2Verdict;
    try {
      verdict = await reviewer(finding, evidence);
    } catch {
      removed.push({
        claim_text: findingClaimText(finding),
        reason:
          "Adversarial reviewer unavailable; finding was not rendered because claim-vs-source verification did not complete.",
      });
      continue;
    }
    if (verdict.supported) {
      findings.push(finding);
    } else {
      removed.push({
        claim_text: findingClaimText(finding),
        reason: `Reviewer: claim not supported by cited sources: ${verdict.unsupported_claims.join("; ")}`,
      });
    }
  }

  return { ...report, findings, evidence, unverified_removed: removed };
}
