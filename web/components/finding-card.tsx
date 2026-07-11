"use client";

import { EvidenceCitation } from "@/components/evidence-citation";
import { useI18n } from "@/lib/i18n";
import { severityStyle, statusStyle } from "@/lib/severity";
import type { EvidenceObject, Finding } from "@/lib/types";

export function FindingCard({
  finding,
  evidenceMap,
  ordinal,
}: {
  finding: Finding;
  evidenceMap: Map<string, EvidenceObject>;
  ordinal: number;
}) {
  const { t } = useI18n();
  const style = statusStyle(finding.status);
  const severity = severityStyle(finding.severity);
  const citations = finding.evidence_ids
    .map((id) => evidenceMap.get(id))
    .filter((item): item is EvidenceObject => Boolean(item));
  const preferredCitationIndex = Math.max(
    0,
    citations.findIndex(
      (evidence) =>
        evidence.source_name === "openFDA-label" && evidence.exact_field === "drug_interactions",
    ),
  );

  return (
    <article
      className={`relative overflow-hidden rounded-xl border ${style.border} bg-paper-raised shadow-[0_10px_35px_rgba(20,24,28,0.045)]`}
      aria-labelledby={`finding-${ordinal}-headline`}
      data-testid="verified-finding"
      data-finding-drugs={JSON.stringify(finding.drugs)}
      data-finding-citations={citations.length}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} aria-hidden="true" />

      <div className="pl-5 pr-5 sm:pl-7 sm:pr-7">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline py-4">
          <span className={`font-mono-source text-[12px] font-semibold ${style.text}`}>
            {String(ordinal + 1).padStart(2, "0")}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} ${style.text} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.accent}`} aria-hidden="true" />
            {t(finding.status === "red-flag" ? "finding.redFlag" : finding.status === "flagged" ? "finding.flagged" : "finding.informational")}
          </span>
          <span className="inline-flex items-center rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("finding.severity", { severity: t(`severity.${finding.severity}` as "severity.major" | "severity.moderate" | "severity.minor") })}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {finding.drugs.map((drug) => (
              <span
                key={drug}
                className="rounded-md bg-paper border border-hairline px-2 py-0.5 text-[12px] font-medium text-ink-muted"
              >
                {drug}
              </span>
            ))}
          </div>
        </header>

        <h3
          id={`finding-${ordinal}-headline`}
          className="py-4 font-serif-display text-[20px] leading-snug text-ink text-pretty sm:text-[23px]"
        >
          {finding.headline}
        </h3>

        <div className="grid border-y border-hairline md:grid-cols-3">
          <FindingDetail label={t("finding.whyPatient")} value={finding.why_this_patient} />
          <FindingDetail label={t("finding.mechanism")} value={finding.mechanism} />
          <FindingDetail label={t("finding.monitoring")} value={finding.monitoring ?? t("finding.noMonitoring")} />
        </div>

        {citations.length > 0 ? (
          <div className="py-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {t("finding.citedSources", { count: citations.length })}
            </p>
            <div>
              {citations.map((evidence, i) => (
                <EvidenceCitation
                  key={evidence.id}
                  evidence={evidence}
                  index={i}
                  drugs={finding.drugs}
                  defaultOpen={ordinal === 0 && i === preferredCitationIndex}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function FindingDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-hairline px-0 py-4 last:border-b-0 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{value}</p>
    </div>
  );
}
