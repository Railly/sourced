import { ClinicianQuestions } from "@/components/clinician-questions";
import { FindingCard } from "@/components/finding-card";
import { PairwiseContrast } from "@/components/pairwise-contrast";
import { PatientHeader } from "@/components/patient-header";
import { PipelineStatus } from "@/components/pipeline-status";
import { ReportFooter } from "@/components/report-footer";
import { ReviewAssistant } from "@/components/review-assistant";
import { VerificationPanel } from "@/components/verification-panel";
import { buildEvidenceMap, rankFindings } from "@/lib/report";
import type { SafetyReport } from "@/lib/types";

interface ManifestSummary {
  release: string;
  license: string;
  coverage: { files: string[] };
}

export function ReportView({ report, manifest }: { report: SafetyReport; manifest: ManifestSummary }) {
  const findings = rankFindings(report.findings);
  const evidenceMap = buildEvidenceMap(report.evidence);
  const flaggedCount = findings.filter((finding) => finding.status !== "informational").length;
  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8"
      >
        <div id="overview" className="scroll-mt-20">
          <PatientHeader summary={report.patient_summary} patient={report.patient} />
          <div className="mt-4">
            <PipelineStatus pipeline={report.pipeline} manifest={manifest} />
          </div>
        </div>

        <VerificationPanel rejected={report.unverified_removed} />
        <ReviewAssistant report={report} />

        <section id="findings" aria-labelledby="findings-heading" className="flex scroll-mt-20 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 id="findings-heading" className="font-serif-display text-[21px] text-ink">
              {flaggedCount} flagged interactions
            </h2>
            <span className="font-mono-source text-[12px] text-ink-faint">
              {findings.length} total · ranked by severity
            </span>
          </div>

          {findings.length > 0 ? (
            <div className="flex flex-col gap-4">
              {findings.map((finding, index) => (
                <FindingCard
                  key={`${finding.headline}-${index}`}
                  finding={finding}
                  evidenceMap={evidenceMap}
                  ordinal={index}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-hairline bg-paper-raised px-5 py-6 text-[14px] text-ink-muted">
              No verified safety findings were published for this patient.
            </p>
          )}
        </section>

        <div id="comparison" className="scroll-mt-20">
          <PairwiseContrast finding={findings[0]} />
        </div>

        <div id="questions" className="scroll-mt-20">
          <ClinicianQuestions questions={report.questions_for_clinician} />
        </div>
      </main>
      <ReportFooter generatedAt={report.generated_at} />
    </>
  );
}
