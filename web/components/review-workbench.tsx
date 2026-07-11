"use client";

import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ReportView } from "@/components/report-view";
import { ReviewIntake } from "@/components/review-intake";
import type { ReviewProgressEvent } from "@/components/review-progress";
import { SectionNav } from "@/components/section-nav";
import {
  draftFromCase,
  emptyReviewCase,
  serializeReviewCase,
  type ReviewCaseDraft,
  type ReviewCaseInput,
} from "@/lib/review-case";
import type { SafetyReport } from "@/lib/types";

interface ManifestSummary {
  release: string;
  license: string;
  coverage: { files: string[] };
}

type StreamMessage =
  | ({ type: "stage" } & ReviewProgressEvent)
  | { type: "report"; report: SafetyReport }
  | { type: "error"; error: string };

export function ReviewWorkbench({
  initialReport,
  goldenCase,
  manifest,
}: {
  initialReport: SafetyReport;
  goldenCase: ReviewCaseInput;
  manifest: ManifestSummary;
}) {
  const [report, setReport] = useState(initialReport);
  const [draft, setDraft] = useState<ReviewCaseDraft>(() => emptyReviewCase());
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [syntheticConfirmed, setSyntheticConfirmed] = useState(false);
  const [progress, setProgress] = useState<ReviewProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  function openNewReview(): void {
    if (intakeOpen) {
      setIntakeOpen(false);
      return;
    }
    setDraft(emptyReviewCase());
    setSyntheticConfirmed(false);
    setProgress([]);
    setError(null);
    setIntakeOpen(true);
  }

  async function runReview(): Promise<void> {
    setError(null);
    setProgress([]);
    let reviewCase: ReviewCaseInput;
    try {
      reviewCase = serializeReviewCase(draft);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Review input is invalid.");
      return;
    }

    setRunning(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ case: reviewCase, syntheticOrDeidentified: syntheticConfirmed }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The verified review could not start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedReport: SafetyReport | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          if (!rawLine.trim()) continue;
          const message = JSON.parse(rawLine) as StreamMessage;
          if (message.type === "stage") {
            setProgress((events) => [...events, message]);
          } else if (message.type === "report") {
            completedReport = message.report;
          } else if (message.type === "error") {
            throw new Error(message.error);
          }
        }
        if (done) break;
      }
      if (!completedReport) throw new Error("The pipeline completed without a verified report.");
      setReport(completedReport);
      setIntakeOpen(false);
      window.requestAnimationFrame(() => {
        document.getElementById("overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The verified review failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-info"
      >
        Skip to main content
      </a>
      <AppHeader
        generatedAt={report.generated_at}
        intakeOpen={intakeOpen}
        onNewReview={openNewReview}
      />
      {intakeOpen ? (
        <ReviewIntake
          draft={draft}
          onChange={setDraft}
          onLoadGolden={() => {
            setDraft(draftFromCase(goldenCase));
            setSyntheticConfirmed(true);
            setError(null);
          }}
          onRun={() => void runReview()}
          onCancel={() => setIntakeOpen(false)}
          running={running}
          syntheticConfirmed={syntheticConfirmed}
          onSyntheticConfirmed={setSyntheticConfirmed}
          progress={progress}
          error={error}
        />
      ) : null}
      <SectionNav />
      <ReportView report={report} manifest={manifest} />
    </div>
  );
}
