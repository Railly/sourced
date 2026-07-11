"use client";

import { useI18n } from "@/lib/i18n";
import { statusStyle } from "@/lib/severity";
import type { Finding } from "@/lib/types";

function firstSentence(value: string): string {
  return value.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? value;
}

export function PairwiseContrast({ finding }: { finding: Finding | undefined }) {
  const { t } = useI18n();
  if (!finding) return null;

  return (
    <section aria-labelledby="pairwise-contrast-heading" className="flex flex-col gap-4">
      <div>
        <h2
          id="pairwise-contrast-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
        >
          {t("pairwise.title")}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted text-pretty">
          {t("pairwise.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-0 sm:rounded-xl sm:border sm:border-hairline sm:overflow-hidden">
        <PairwiseColumn finding={finding} />
        <SourcedColumn finding={finding} />
      </div>
    </section>
  );
}

function PairwiseColumn({ finding }: { finding: Finding }) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-hairline bg-paper sm:rounded-none sm:border-0 sm:border-r sm:border-hairline px-5 sm:px-6 py-5 sm:py-6 flex flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {t("pairwise.checker")}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-faint">{t("pairwise.lookup")}</p>

      <div className="mt-4 flex-1 flex flex-col justify-center rounded-lg border border-hairline-strong bg-paper-raised px-4 py-6 text-center">
        <p className="font-mono-source text-[13px] text-ink-muted">
          {finding.drugs.slice(0, 2).join(" + ")}
        </p>
        <p className="mt-2 text-[15px] font-medium text-ink">{t("pairwise.detected")}</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          {t("pairwise.severity", { severity: t(`severity.${finding.severity}` as "severity.major" | "severity.moderate" | "severity.minor") })}
        </p>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
        {t("pairwise.static")}
      </p>
    </div>
  );
}

function SourcedColumn({ finding }: { finding: Finding }) {
  const { t } = useI18n();
  const status = statusStyle(finding.status);

  return (
    <div className="rounded-xl border border-major-border bg-major-bg sm:rounded-none sm:border-0 px-5 sm:px-6 py-5 sm:py-6 flex flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-major">Sourced</p>
      <p className="mt-0.5 text-[12px] text-ink-muted">{t("pairwise.sourced")}</p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full ${status.bg} border border-major-border ${status.text} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.accent}`} aria-hidden="true" />
            {t(finding.status === "red-flag" ? "finding.redFlag" : finding.status === "flagged" ? "finding.flagged" : "finding.informational")}
          </span>
          <span className="inline-flex items-center rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("finding.severity", { severity: t(`severity.${finding.severity}` as "severity.major" | "severity.moderate" | "severity.minor") })}
          </span>
        </div>

        <h3 className="font-serif-display text-[17px] leading-snug text-ink text-pretty">
          {finding.headline}
        </h3>

        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {firstSentence(finding.mechanism)}
        </p>

        <div className="rounded-lg bg-paper-raised border border-hairline px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t("finding.whyPatient")}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
            {finding.why_this_patient}
          </p>
        </div>

        {finding.monitoring ? (
          <div className="flex gap-2.5 rounded-lg border border-hairline bg-paper-raised px-4 py-3">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint"
            >
              <path
                d="M10 6v4l2.5 2.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {t("finding.monitoring")}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{finding.monitoring}</p>
            </div>
          </div>
        ) : null}

        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-paper-raised border border-hairline px-2.5 py-1 text-[11px] font-mono-source text-ink-muted">
          {t("pairwise.cited", { count: finding.evidence_ids.length })}
        </span>
      </div>
    </div>
  );
}
