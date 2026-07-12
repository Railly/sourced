import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingest } from "./ingest/index.ts";
import { crossReferencePharmacology, enrichFindingsMechanism, extractProfiles } from "./retrieve/pharmacology.ts";
import { attachResearchCandidates } from "./research/index.ts";
import { retrieve } from "./retrieve/index.ts";
import { synthesize } from "./synthesize/index.ts";
import type { EvidenceObject, Finding, PatientContext, ReviewLocale, SafetyReport } from "./types/index.ts";
import { verify } from "./verify/index.ts";

export type ReviewStage = "ingest" | "retrieve" | "synthesize" | "verify";

export interface ReviewStageEvent {
  stage: ReviewStage;
  status: "running" | "completed";
  detail?: string;
}

interface AuditEntry {
  finding: Finding;
  evidence: (EvidenceObject & { query: string; timestamp: string })[];
}

export interface AuditLedger {
  generated_at: string;
  findings: AuditEntry[];
  unverified_removed: SafetyReport["unverified_removed"];
  report: SafetyReport;
}

interface RunReviewOptions {
  now?: string;
  ddinterPath?: string;
  onStage?: (event: ReviewStageEvent) => void | Promise<void>;
  synthesizeReport?: typeof synthesize;
  verifyReport?: typeof verify;
  extractProfiles?: typeof extractProfiles;
  pharmacology?: boolean;
  locale?: ReviewLocale;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function emit(
  handler: RunReviewOptions["onStage"],
  event: ReviewStageEvent,
): Promise<void> {
  await handler?.(event);
}

export function buildAuditLedger(report: SafetyReport): AuditLedger {
  const evidenceById = new Map(report.evidence.map((item) => [item.id, item]));
  return {
    generated_at: report.generated_at,
    findings: report.findings.map((finding) => ({
      finding,
      evidence: finding.evidence_ids.map((id) => {
        const item = evidenceById.get(id);
        if (!item) throw new Error(`audit: verified finding referenced missing evidence_id ${id}`);
        return { ...item, query: item.retrieval_query, timestamp: item.retrieved_at };
      }),
    })),
    unverified_removed: report.unverified_removed,
    report,
  };
}

export async function runVerifiedReview(
  raw: unknown,
  options: RunReviewOptions = {},
): Promise<SafetyReport> {
  const now = options.now ?? new Date().toISOString();
  const ddinterPath = options.ddinterPath ?? resolve(repoRoot, "data/sources/ddinter");
  const synthesizeReport = options.synthesizeReport ?? synthesize;
  const verifyReport = options.verifyReport ?? verify;
  const locale = options.locale ?? "en";

  await emit(options.onStage, { stage: "ingest", status: "running" });
  const patient = await ingest(raw);
  const resolvedCount = patient.medications.filter((medication) => medication.rxcui).length;
  await emit(options.onStage, {
    stage: "ingest",
    status: "completed",
    detail: locale === "es"
      ? `${resolvedCount}/${patient.medications.length} medicamentos resueltos`
      : `${resolvedCount}/${patient.medications.length} medications resolved`,
  });

  await emit(options.onStage, { stage: "retrieve", status: "running" });
  const retrieval = await retrieve(patient, ddinterPath, now);

  // Mechanism enrichment: a source-bound model reads the retrieved FDA labels
  // and names the pharmacology (CYP inhibitor↔substrate, additive QT/anticholinergic)
  // so findings state a real mechanism, not a bare DDInter severity. Every added
  // claim still quotes the label. Deterministic retrieval stays LLM-free above;
  // this step only reads sources already retrieved. Off in tests via option.
  const evidence = [...retrieval.evidence];
  if (options.pharmacology !== false) {
    const profiles = await (options.extractProfiles ?? extractProfiles)(retrieval.labels);
    evidence.push(...crossReferencePharmacology(profiles, now));
  }

  await emit(options.onStage, {
    stage: "retrieve",
    status: "completed",
    detail: locale === "es"
      ? `${evidence.length} objetos de evidencia citables`
      : `${evidence.length} citable evidence objects`,
  });

  await emit(options.onStage, { stage: "synthesize", status: "running" });
  const draft = await synthesizeReport(patient, evidence, now, locale);
  await emit(options.onStage, {
    stage: "synthesize",
    status: "completed",
    detail: locale === "es"
      ? `${draft.findings.length} hallazgos en borrador`
      : `${draft.findings.length} draft findings`,
  });

  await emit(options.onStage, { stage: "verify", status: "running" });
  const rawVerified = await verifyReport(draft, evidence, { patient, locale });
  // Name the real CYP mechanism on findings that survived verification, then add
  // the cited mechanism evidence to the ledger. Done AFTER verify so a mechanism
  // citation can never delete a source-backed finding — it only enriches survivors.
  const enrichedFindings = enrichFindingsMechanism(rawVerified.findings, evidence);
  const citedMechanismIds = new Set(enrichedFindings.flatMap((f) => f.evidence_ids).filter((id) => id.startsWith("cyp:")));
  const mechanismEvidence = evidence.filter((item) => citedMechanismIds.has(item.id) && !rawVerified.evidence.some((existing) => existing.id === item.id));
  const verified = { ...rawVerified, findings: enrichedFindings, evidence: [...rawVerified.evidence, ...mechanismEvidence] };
  const withResearch = attachResearchCandidates(verified, patient, retrieval.ddinter);
  const report: SafetyReport = {
    ...withResearch,
    patient,
    pipeline: {
      mode: "live",
      model: "Claude Opus 4.8",
      stages: ["ingest", "retrieve", "synthesize", "verify"],
      ddinter: {
        source_rows: retrieval.ddinter.coverage.rawRows,
        unique_pairs: retrieval.ddinter.coverage.uniquePairs,
        unique_drugs: retrieval.ddinter.coverage.uniqueDrugs,
        source_files: retrieval.ddinter.coverage.files.length,
      },
    },
  };
  await emit(options.onStage, {
    stage: "verify",
    status: "completed",
    detail: locale === "es"
      ? `${report.findings.length} hallazgos verificados publicados`
      : `${report.findings.length} verified findings published`,
  });
  return report;
}

export function patientFromReport(report: SafetyReport): PatientContext | undefined {
  return report.patient;
}
