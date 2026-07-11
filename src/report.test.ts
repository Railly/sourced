import { expect, test } from "bun:test";
import type { EvidenceObject, Finding, SafetyReport } from "./types/index.ts";

interface AuditLedger {
  report: SafetyReport;
  findings: Array<{ finding: Finding; evidence: EvidenceObject[] }>;
}

const ledger = (await Bun.file(
  new URL("../out/report.json", import.meta.url),
).json()) as AuditLedger;
const webReport = (await Bun.file(
  new URL("../web/public/data/report.json", import.meta.url),
).json()) as SafetyReport;
const ddinterManifest = await Bun.file(
  new URL("../data/sources/ddinter/manifest.json", import.meta.url),
).json();
const webDdinterManifest = await Bun.file(
  new URL("../web/public/data/ddinter-manifest.json", import.meta.url),
).json();

test("cached web report is the exact audited report", () => {
  expect(webReport).toEqual(ledger.report);
});

test("cached report renders only findings with resolvable evidence", () => {
  const evidenceIds = new Set(ledger.report.evidence.map((item) => item.id));

  for (const finding of ledger.report.findings) {
    expect(finding.evidence_ids.length).toBeGreaterThan(0);
    expect(`${finding.headline} ${finding.mechanism}`).not.toMatch(
      /no (?:concrete )?(?:interaction|claim).*(?:supported|established)/i,
    );
    for (const id of finding.evidence_ids) expect(evidenceIds.has(id)).toBe(true);
  }

  for (const removed of ledger.report.unverified_removed) {
    expect(removed.claim_text.length).toBeGreaterThan(0);
    expect(removed.reason.length).toBeGreaterThan(0);
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
  expect(context).toMatch(/INR.{0,120}(?:may|could) (?:climb|rise)/i);
  expect(context).not.toMatch(/INR.{0,120}will (?:climb|rise)/i);
  expect(context).not.toMatch(/(?:top|bottom) of (?:the )?\d+(?:\.\d+)?[-–]\d+(?:\.\d+)? range/i);
});

test("cached evidence uses secure, judge-resolvable citation targets", () => {
  for (const evidence of ledger.report.evidence) {
    expect(evidence.source_url).toStartWith("https://");
    expect(evidence.source_url).not.toContain("ddinter.scbdd.com");
  }
});

test("cached report carries structured patient context and completed pipeline provenance", () => {
  expect(webReport.patient?.medications.length).toBeGreaterThan(0);
  expect(webReport.patient?.duplicate_medications?.[0]?.ingredient_rxcui).toBe("11289");
  expect(webReport.pipeline?.stages).toEqual(["ingest", "retrieve", "synthesize", "verify"]);
  expect(webReport.pipeline?.ddinter.source_rows).toBe(ddinterManifest.coverage.rawRows);
  expect(webReport.pipeline?.ddinter.unique_pairs).toBe(ddinterManifest.coverage.uniquePairs);
});

test("rendered FDA evidence exposes version and exact supporting text", () => {
  const labels = webReport.evidence.filter((item) => item.source_name === "openFDA-label");
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.source_version?.length).toBeGreaterThan(0);
    expect(label.supporting_text?.length).toBeGreaterThan(0);
    expect(label.quoted_text).toContain(label.supporting_text!);
  }
});

test("web coverage manifest is the exact verified source manifest", () => {
  expect(webDdinterManifest).toEqual(ddinterManifest);
});
