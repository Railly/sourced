import type { Spec } from "@json-render/core";
import type { SafetyReport } from "@/lib/types";

/**
 * Rebuilds the exact json-render Spec that the live /api/review-ui stream
 * produces at completion, from an already-verified SafetyReport. Showcase
 * cases (golden + published) render through this offline, so the packet is
 * deterministic and needs no runtime model call or API key. The element shape,
 * types, and child order must stay in lockstep with the server stream in
 * web/app/api/review-ui/route.ts and the catalog in live-review-canvas.tsx.
 */
export function buildCompletedReviewSpec(report: SafetyReport, locale: "en" | "es" = "en"): Spec {
  const findingIds = report.findings.map((_, index) => `finding-${index}`);
  const hasRisks = findingIds.length > 0;
  const hasQuestions = report.questions_for_clinician.length > 0;

  const children = [
    "pipeline",
    "verification",
    ...(hasRisks ? ["risks"] : []),
    ...findingIds,
    ...(hasQuestions ? ["questions"] : []),
  ];

  const elements: Spec["elements"] = {
    workspace: {
      type: "LiveReview",
      visible: true,
      props: { report },
      children,
    },
    pipeline: {
      type: "PipelineProgress",
      visible: true,
      props: {
        stage: "verify",
        status: "completed",
        detail: locale === "es"
          ? `${report.findings.length} hallazgos verificados publicados`
          : `${report.findings.length} verified findings published`,
      },
      children: [],
    },
    verification: {
      type: "VerificationSummary",
      visible: true,
      props: {},
      children: [],
    },
  };

  if (hasRisks) {
    elements.risks = {
      type: "RiskOverview",
      visible: true,
      props: { findingIds },
      children: [],
    };
  }

  for (const findingId of findingIds) {
    elements[findingId] = {
      type: "FindingDetail",
      visible: true,
      props: { findingId },
      children: [],
    };
  }

  if (hasQuestions) {
    elements.questions = {
      type: "QuestionsPanel",
      visible: true,
      props: { questionIndexes: report.questions_for_clinician.map((_, index) => index) },
      children: [],
    };
  }

  return { root: "workspace", elements };
}

/**
 * A single-stage running spec used to animate the pipeline locally while the
 * precomputed report is revealed, so the offline showcase keeps the live feel.
 */
export function buildRunningReviewSpec(
  stage: "ingest" | "retrieve" | "synthesize" | "verify",
  locale: "en" | "es" = "en",
): Spec {
  const detail: Record<typeof stage, [string, string]> = {
    ingest: ["Resolving medications", "Resolviendo medicamentos"],
    retrieve: ["Retrieving cited evidence", "Recuperando evidencia citada"],
    synthesize: ["Ranking patient-contextual risks", "Priorizando riesgos según el paciente"],
    verify: ["Rechecking every claim against its source", "Reverificando cada afirmación contra su fuente"],
  };
  return {
    root: "workspace",
    elements: {
      workspace: {
        type: "LiveReview",
        visible: true,
        props: { report: null },
        children: ["pipeline"],
      },
      pipeline: {
        type: "PipelineProgress",
        visible: true,
        props: { stage, status: "running", detail: locale === "es" ? detail[stage][1] : detail[stage][0] },
        children: [],
      },
    },
  };
}
