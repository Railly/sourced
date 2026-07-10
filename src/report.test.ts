import { expect, test } from "bun:test";
import type { EvidenceObject, Finding, SafetyReport } from "./types/index.ts";

interface AuditLedger {
  report: SafetyReport;
  findings: Array<{ finding: Finding; evidence: EvidenceObject[] }>;
}

const ledger = (await Bun.file(
  new URL("../out/report.json", import.meta.url),
).json()) as AuditLedger;

test("cached report renders only findings with resolvable evidence", () => {
  const evidenceIds = new Set(ledger.report.evidence.map((item) => item.id));
  expect(ledger.report.unverified_removed).toEqual([]);

  for (const finding of ledger.report.findings) {
    expect(finding.evidence_ids.length).toBeGreaterThan(0);
    for (const id of finding.evidence_ids) expect(evidenceIds.has(id)).toBe(true);
  }
});

test("audit ledger mirrors every rendered finding and its cited evidence", () => {
  expect(ledger.findings).toHaveLength(ledger.report.findings.length);

  for (const [index, entry] of ledger.findings.entries()) {
    const finding = ledger.report.findings[index];
    if (!finding) throw new Error(`Missing report finding at index ${index}`);
    expect(entry.finding).toEqual(finding);
    expect(entry.evidence.map((item) => item.id)).toEqual(finding.evidence_ids);
  }
});

test("patient-specific INR language preserves uncertainty", () => {
  const context = ledger.report.findings.map((finding) => finding.why_this_patient).join(" ");
  expect(context).toMatch(/INR may (?:climb|rise)/i);
  expect(context).not.toMatch(/INR will (?:climb|rise)/i);
});

test("cached evidence uses secure, judge-resolvable citation targets", () => {
  for (const evidence of ledger.report.evidence) {
    expect(evidence.source_url).toStartWith("https://");
    expect(evidence.source_url).not.toContain("ddinter.scbdd.com");
  }
});
