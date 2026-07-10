import { ClinicianQuestions } from "@/components/clinician-questions";
import { FindingCard } from "@/components/finding-card";
import { PairwiseContrast } from "@/components/pairwise-contrast";
import { PatientHeader } from "@/components/patient-header";
import { ReportFooter } from "@/components/report-footer";
import { VerificationPanel } from "@/components/verification-panel";
import { buildEvidenceMap, rankFindings, uniqueDrugs } from "@/lib/report";
import type { SafetyReport } from "@/lib/types";
import reportData from "@/public/data/report.json";

const report = reportData as SafetyReport;

export default function ReviewPage() {
  const findings = rankFindings(report.findings);
  const evidenceMap = buildEvidenceMap(report.evidence);
  const drugs = uniqueDrugs(report.findings);

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-info"
      >
        Skip to main content
      </a>
      <PatientHeader summary={report.patient_summary} drugs={drugs} />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 mx-auto w-full max-w-3xl px-5 sm:px-8 py-8 sm:py-10 flex flex-col gap-8"
      >
        <VerificationPanel rejected={report.unverified_removed} />

        <section aria-labelledby="findings-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2
              id="findings-heading"
              className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
            >
              Findings, ranked by severity
            </h2>
            <span className="text-[12px] text-ink-faint font-mono-source">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
            </span>
          </div>

          {findings.length > 0 ? (
            <div className="flex flex-col gap-4">
              {findings.map((finding, i) => (
                <FindingCard
                  key={`${finding.headline}-${i}`}
                  finding={finding}
                  evidenceMap={evidenceMap}
                  ordinal={i}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-hairline bg-paper-raised px-5 py-6 text-[14px] text-ink-muted">
              No safety findings were generated for this patient.
            </p>
          )}
        </section>

        <PairwiseContrast finding={findings[0]} />

        <ClinicianQuestions questions={report.questions_for_clinician} />
      </main>

      <ReportFooter generatedAt={report.generated_at} />
    </div>
  );
}
