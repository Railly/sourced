import { EvidenceCitation } from "@/components/evidence-citation";
import { severityStyle, statusLabel, statusStyle } from "@/lib/severity";
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
  const style = statusStyle(finding.status);
  const severity = severityStyle(finding.severity);
  const citations = finding.evidence_ids
    .map((id) => evidenceMap.get(id))
    .filter((item): item is EvidenceObject => Boolean(item));

  return (
    <article
      className={`relative rounded-xl border ${style.border} bg-paper-raised shadow-[0_1px_2px_rgba(20,24,28,0.04)] overflow-hidden`}
      aria-labelledby={`finding-${ordinal}-headline`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} aria-hidden="true" />

      <div className="pl-5 pr-5 sm:pl-6 sm:pr-6 py-5 sm:py-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} ${style.text} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.accent}`} aria-hidden="true" />
            {statusLabel(finding.status)}
          </span>
          <span className="inline-flex items-center rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {severity.label} severity
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
          className="mt-3 font-serif-display text-[19px] sm:text-[20px] leading-snug text-ink text-pretty"
        >
          {finding.headline}
        </h3>

        <p className="mt-2.5 text-[14px] leading-relaxed text-ink-muted">{finding.mechanism}</p>

        <div className="mt-4 rounded-lg bg-paper border border-hairline px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Why this patient
          </p>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">{finding.why_this_patient}</p>
        </div>

        {finding.monitoring ? (
          <div className="mt-3 flex gap-2.5 rounded-lg border border-hairline px-4 py-3">
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
                Recommended monitoring
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">{finding.monitoring}</p>
            </div>
          </div>
        ) : null}

        {citations.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-2">
              Cited sources ({citations.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {citations.map((evidence, i) => (
                <EvidenceCitation key={evidence.id} evidence={evidence} index={i} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
