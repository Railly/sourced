"use client";

import type { Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { createContext, useContext, useMemo } from "react";
import { ClinicianQuestions } from "@/components/clinician-questions";
import { EvidenceCitation } from "@/components/evidence-citation";
import { FindingCard } from "@/components/finding-card";
import { PairwiseContrast } from "@/components/pairwise-contrast";
import { VerificationPanel } from "@/components/verification-panel";
import { buildEvidenceMap } from "@/lib/report";
import { reviewCatalog } from "@/lib/genui/catalog";
import { validateSafeSpec, type LensMode, type SafeSpec } from "@/lib/genui/spec";
import { useI18n } from "@/lib/i18n";
import { statusStyle } from "@/lib/severity";
import type { Finding, SafetyReport } from "@/lib/types";

const ReportContext = createContext<SafetyReport | null>(null);

function useReport(): SafetyReport {
  const report = useContext(ReportContext);
  if (!report) throw new Error("Verified report context is missing");
  return report;
}

function findingAt(report: SafetyReport, id: string): { finding: Finding; index: number } | null {
  const match = /^finding-(\d+)$/.exec(id);
  const index = match ? Number(match[1]) : -1;
  const finding = report.findings[index];
  return finding ? { finding, index } : null;
}

function statusTranslationKey(status: Finding["status"]) {
  if (status === "red-flag") return "finding.redFlag" as const;
  if (status === "flagged") return "finding.flagged" as const;
  return "finding.informational" as const;
}

const { registry } = defineRegistry(reviewCatalog, {
  components: {
    ReviewStack: ({ props, children }) => {
      const { t } = useI18n();
      const label = props.mode === "priorities"
        ? { title: t("lens.priorityTitle"), description: t("lens.priorityDescription") }
        : props.mode === "evidence"
          ? { title: t("lens.evidenceTitle"), description: t("lens.evidenceDescription") }
          : props.mode === "handoff"
            ? { title: t("lens.handoffTitle"), description: t("lens.handoffDescription") }
            : { title: t("lens.comparisonTitle"), description: t("lens.comparisonDescription") };
      return (
        <section className="overflow-hidden rounded-xl border border-hairline bg-paper-raised">
          <header className="border-b border-hairline bg-paper px-5 py-4 sm:px-6">
            <p className="font-serif-display text-[20px] text-ink">{label.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{label.description}</p>
          </header>
          <div className="flex flex-col gap-4 p-4 sm:p-6">{children}</div>
        </section>
      );
    },
    VerificationSummary: () => {
      const report = useReport();
      return <VerificationPanel rejected={report.unverified_removed} />;
    },
    RiskOverview: ({ props }) => {
      const { t } = useI18n();
      const report = useReport();
      const findings = props.findingIds.flatMap((id) => {
        const match = findingAt(report, id);
        return match ? [match] : [];
      });
      return (
        <ol className="divide-y divide-hairline rounded-xl border border-hairline bg-paper-raised">
          {findings.map(({ finding, index }) => {
            const status = statusStyle(finding.status);
            return (
              <li key={`${finding.headline}-${index}`} className="flex gap-4 px-4 py-4 sm:px-5">
                <span className={`font-mono-source text-[11px] font-semibold ${status.text}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${status.text}`}>
                      {t(statusTranslationKey(finding.status))}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      {t(`severity.${finding.severity}` as "severity.major" | "severity.moderate" | "severity.minor")}
                    </span>
                  </div>
                  <p className="mt-1 font-serif-display text-[17px] leading-snug text-ink">
                    {finding.headline}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {finding.why_this_patient}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      );
    },
    FindingDetail: ({ props }) => {
      const report = useReport();
      const match = findingAt(report, props.findingId);
      if (!match) return null;
      return (
        <FindingCard
          finding={match.finding}
          evidenceMap={buildEvidenceMap(report.evidence)}
          ordinal={match.index}
        />
      );
    },
    EvidencePanel: ({ props }) => {
      const report = useReport();
      const evidence = report.evidence.find((item) => item.id === props.evidenceId);
      if (!evidence) return null;
      const drugs = report.findings.find((finding) => finding.evidence_ids.includes(evidence.id))?.drugs ?? [];
      return (
        <div className="rounded-xl border border-hairline bg-paper-raised px-5">
          <EvidenceCitation evidence={evidence} index={0} drugs={drugs} defaultOpen />
        </div>
      );
    },
    QuestionsPanel: ({ props }) => {
      const report = useReport();
      const questions = props.questionIndexes.flatMap((index) => {
        const question = report.questions_for_clinician[index];
        return question ? [question] : [];
      });
      return <ClinicianQuestions questions={questions} />;
    },
    PairwiseComparison: ({ props }) => {
      const report = useReport();
      return <PairwiseContrast finding={findingAt(report, props.findingId)?.finding} />;
    },
  },
});

function validateReportReferences(report: SafetyReport, spec: SafeSpec): void {
  const evidenceIds = new Set(report.evidence.map((evidence) => evidence.id));
  for (const element of Object.values(spec.elements)) {
    if (element.type === "RiskOverview") {
      if (element.props.findingIds.some((id) => !findingAt(report, id))) {
        throw new Error("Generated view referenced an unavailable finding");
      }
    }
    if (
      (element.type === "FindingDetail" || element.type === "PairwiseComparison") &&
      !findingAt(report, element.props.findingId)
    ) {
      throw new Error("Generated view referenced an unavailable finding");
    }
    if (element.type === "EvidencePanel" && !evidenceIds.has(element.props.evidenceId)) {
      throw new Error("Generated view referenced unavailable evidence");
    }
    if (
      element.type === "QuestionsPanel" &&
      element.props.questionIndexes.some((index) => !report.questions_for_clinician[index])
    ) {
      throw new Error("Generated view referenced an unavailable question");
    }
  }
}

export function SafeReviewLens({ report, spec }: { report: SafetyReport; spec: unknown }) {
  const validated = useMemo(() => {
    function validate(value: unknown): Spec {
      const safe = validateSafeSpec(value);
      const catalogResult = reviewCatalog.validate(safe);
      if (!catalogResult.success || !catalogResult.data) throw new Error("Generated view failed catalog validation");
      validateReportReferences(report, safe);
      return catalogResult.data as Spec;
    }

    try {
      return validate(spec);
    } catch {
      return validate(buildFallbackSpec(report, "priorities"));
    }
  }, [report, spec]);

  return (
    <ReportContext.Provider value={report}>
      <JSONUIProvider registry={registry}>
        <Renderer spec={validated} registry={registry} />
      </JSONUIProvider>
    </ReportContext.Provider>
  );
}

export function buildFallbackSpec(report: SafetyReport, mode: LensMode): SafeSpec {
  const findingIds = report.findings.slice(0, 3).map((_, index) => `finding-${index}`);
  const elements: SafeSpec["elements"] = {
    root: { type: "ReviewStack", visible: true, props: { mode }, children: [] },
  };
  const children = elements.root?.type === "ReviewStack" ? elements.root.children : [];
  elements.verification = { type: "VerificationSummary", visible: true, props: {}, children: [] };
  children.push("verification");

  if (mode === "evidence") {
    const evidenceIds = report.findings[0]?.evidence_ids.slice(0, 4) ?? [];
    evidenceIds.forEach((evidenceId, index) => {
      const key = `evidence-${index}`;
      elements[key] = { type: "EvidencePanel", visible: true, props: { evidenceId }, children: [] };
      children.push(key);
    });
  } else if (mode === "comparison") {
    if (findingIds[0]) {
      elements.comparison = {
        type: "PairwiseComparison",
        visible: true,
        props: { findingId: findingIds[0] },
        children: [],
      };
      elements.finding = {
        type: "FindingDetail",
        visible: true,
        props: { findingId: findingIds[0] },
        children: [],
      };
      children.push("comparison", "finding");
    }
  } else {
    if (findingIds.length > 0) {
      elements.risks = { type: "RiskOverview", visible: true, props: { findingIds }, children: [] };
      children.push("risks");
    }
    findingIds.slice(0, 2).forEach((findingId, index) => {
      const key = `finding-${index}`;
      elements[key] = { type: "FindingDetail", visible: true, props: { findingId }, children: [] };
      children.push(key);
    });
    if (mode === "handoff") {
      elements.questions = {
        type: "QuestionsPanel",
        visible: true,
        props: { questionIndexes: report.questions_for_clinician.map((_, index) => index) },
        children: [],
      };
      children.push("questions");
    }
  }
  return { root: "root", elements };
}
