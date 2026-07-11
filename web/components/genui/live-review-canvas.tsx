"use client";

import type { Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { CheckCircle, Circle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { createContext, useContext, useEffect, useState } from "react";
import { ClinicianQuestions } from "@/components/clinician-questions";
import { FindingCard } from "@/components/finding-card";
import { VerificationPanel } from "@/components/verification-panel";
import { buildEvidenceMap } from "@/lib/report";
import { liveReviewCatalog } from "@/lib/genui/live-catalog";
import { useI18n } from "@/lib/i18n";
import { severityStyle, statusLabel, statusStyle } from "@/lib/severity";
import type { Finding, SafetyReport } from "@/lib/types";

const LiveReportContext = createContext<SafetyReport | null>(null);

function useLiveReport(): SafetyReport | null {
  return useContext(LiveReportContext);
}

function findingAt(report: SafetyReport, id: string): { finding: Finding; index: number } | null {
  const match = /^finding-(\d+)$/.exec(id);
  const index = match ? Number(match[1]) : -1;
  const finding = report.findings[index];
  return finding ? { finding, index } : null;
}

const pipelineStages = ["ingest", "retrieve", "synthesize", "verify"] as const;

function statusTranslationKey(status: Finding["status"]) {
  if (status === "red-flag") return "finding.redFlag" as const;
  if (status === "flagged") return "finding.flagged" as const;
  return "finding.informational" as const;
}

const { registry } = defineRegistry(liveReviewCatalog, {
  components: {
    LiveReview: ({ props, children }) => {
      const { t } = useI18n();
      const report = props.report && typeof props.report === "object" ? (props.report as SafetyReport) : null;
      const active = report?.patient?.medications.filter((medication) => (medication.status ?? "active") === "active") ?? [];
      const excluded = report?.patient?.medications.filter((medication) => (medication.status ?? "active") !== "active") ?? [];
      const reviewMappings = active.filter((medication) => medication.resolution !== "exact");
      return (
        <LiveReportContext.Provider value={report}>
          <div
            className="flex flex-col gap-5"
            data-report-finding-count={report?.findings.length ?? 0}
          >
            {report?.patient ? (
              <section
                data-testid="medication-scope"
                className="grid gap-3 rounded-lg border border-hairline bg-paper-raised px-4 py-4 sm:grid-cols-3"
              >
                <MedicationScopeCell
                  label={t("review.episodeScreened")}
                  value={t(active.length === 1 ? "review.medicationCount" : "review.medicationsCount", { count: active.length })}
                  detail={active.map((medication) => medication.name).join(", ") || t("review.none")}
                />
                <MedicationScopeCell
                  label={t("review.timelineExcluded")}
                  value={t(excluded.length === 1 ? "review.medicationCount" : "review.medicationsCount", { count: excluded.length })}
                  detail={excluded.map((medication) => `${medication.name} (${t(`status.${medication.status ?? "active"}` as `status.${NonNullable<typeof medication.status>}`)})`).join(", ") || t("review.none")}
                />
                <MedicationScopeCell
                  label={t("review.mapping")}
                  value={reviewMappings.length === 0 ? t("review.allExact") : t("review.needsReview", { count: reviewMappings.length })}
                  detail={reviewMappings.map((medication) => `${medication.raw} → ${medication.name || t("review.unresolved")}`).join(", ") || t("review.rxnormExact")}
                  warning={reviewMappings.length > 0}
                />
              </section>
            ) : null}
            {children}
          </div>
        </LiveReportContext.Provider>
      );
    },
    PipelineProgress: ({ props }) => {
      const { t } = useI18n();
      const [seen, setSeen] = useState<Array<(typeof pipelineStages)[number]>>([]);
      useEffect(() => {
        setSeen((current) => current.includes(props.stage) ? current : [...current, props.stage]);
      }, [props.stage]);
      const error = props.status === "error";
      const complete = props.status === "completed" && props.stage === "verify";
      return (
        <section
          aria-live="polite"
          role={error ? "alert" : undefined}
          data-pipeline-stage={props.stage}
          data-pipeline-status={props.status}
          data-pipeline-history={seen.join(",")}
          className="border-b border-hairline pb-5"
        >
          <div className="flex items-start gap-3">
            {error ? (
              <WarningCircle className="mt-0.5 h-5 w-5 shrink-0 text-major" weight="regular" />
            ) : complete ? (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-verified" weight="regular" />
            ) : (
              <SpinnerGap className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-info" weight="regular" />
            )}
            <div className="min-w-0">
              <p className="font-serif-display text-[20px] leading-tight text-ink">
                {error
                  ? t("review.paused")
                  : complete
                    ? t("review.ready")
                    : t(props.stage === "ingest"
                        ? "review.resolving"
                        : props.stage === "retrieve"
                          ? "review.retrieving"
                          : props.stage === "synthesize"
                            ? "review.synthesizing"
                            : "review.verifying")}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                {props.detail ?? t("review.nextArtifact")}
              </p>
            </div>
          </div>
          {!error && !complete ? (
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-hairline">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-info" />
            </div>
          ) : null}
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("review.pipelineStages")}>
            {pipelineStages.map((stage) => {
              const reached = seen.includes(stage);
              const active = props.stage === stage && props.status === "running";
              return (
                <li key={stage} className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${active ? "text-info" : reached ? "text-verified" : "text-ink-faint"}`}>
                  {reached && !active ? <CheckCircle className="h-3.5 w-3.5" weight="fill" /> : <Circle className="h-3.5 w-3.5" weight={active ? "duotone" : "regular"} />}
                  {t(stage === "ingest"
                    ? "stage.source"
                    : stage === "retrieve"
                      ? "review.retrieving"
                      : stage === "synthesize"
                        ? "review.synthesizing"
                        : "review.verifying")}
                </li>
              );
            })}
          </ol>
        </section>
      );
    },
    VerificationSummary: () => {
      const report = useLiveReport();
      return report ? <VerificationPanel rejected={report.unverified_removed} /> : null;
    },
    RiskOverview: ({ props }) => {
      const { t } = useI18n();
      const report = useLiveReport();
      if (!report) return null;
      const findings = props.findingIds.flatMap((id) => {
        const match = findingAt(report, id);
        return match ? [match] : [];
      });
      return (
        <section aria-labelledby="streamed-findings-heading">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="streamed-findings-heading" className="font-serif-display text-[21px] text-ink">
              {t("review.findings")}
            </h2>
            <span className="text-[11px] text-ink-faint">{t("review.streaming")}</span>
          </div>
          <ol className="divide-y divide-hairline border-y border-hairline">
            {findings.map(({ finding, index }) => {
              const status = statusStyle(finding.status);
              const severity = severityStyle(finding.severity);
              return (
                <li key={`${finding.headline}-${index}`} className="flex gap-4 py-4">
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
                    <p className="mt-1 font-serif-display text-[18px] leading-snug text-ink">
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
        </section>
      );
    },
    FindingDetail: ({ props }) => {
      const report = useLiveReport();
      if (!report) return null;
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
    QuestionsPanel: ({ props }) => {
      const report = useLiveReport();
      if (!report) return null;
      const questions = props.questionIndexes.flatMap((index) => {
        const question = report.questions_for_clinician[index];
        return question ? [question] : [];
      });
      return <ClinicianQuestions questions={questions} />;
    },
  },
});

function MedicationScopeCell({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 text-[12.5px] font-semibold ${warning ? "text-moderate" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">{detail}</p>
    </div>
  );
}

export function reportFromLiveSpec(spec: Spec | null): SafetyReport | null {
  if (!spec?.root) return null;
  const root = spec.elements[spec.root];
  if (!root || root.type !== "LiveReview") return null;
  const report = (root.props as { report?: unknown }).report;
  return report && typeof report === "object" ? (report as SafetyReport) : null;
}

export function LiveReviewCanvas({ spec, streaming }: { spec: Spec | null; streaming: boolean }) {
  const { t } = useI18n();
  if (!spec?.root) {
    return (
      <div className="flex min-h-80 items-center justify-center border-y border-hairline text-center">
        <div>
          <Circle className="mx-auto h-5 w-5 text-ink-faint" weight="regular" />
          <p className="mt-3 font-serif-display text-[19px] text-ink">{t("review.waiting")}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">{t("review.waitingHelp")}</p>
        </div>
      </div>
    );
  }

  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} loading={streaming} />
    </JSONUIProvider>
  );
}
