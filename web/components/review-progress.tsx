"use client";

import type { ReviewStage } from "@core/review";

export interface ReviewProgressEvent {
  stage: ReviewStage;
  status: "running" | "completed";
  detail?: string;
}

const stages: ReviewStage[] = ["ingest", "retrieve", "synthesize", "verify"];

export function ReviewProgress({ events }: { events: ReviewProgressEvent[] }) {
  return (
    <section aria-label="Live review progress" className="border-t border-hairline bg-paper px-5 py-5 sm:px-6">
      <ol className="grid gap-3 sm:grid-cols-4">
        {stages.map((stage, index) => {
          const event = [...events].reverse().find((candidate) => candidate.stage === stage);
          const done = event?.status === "completed";
          const active = event?.status === "running";
          return (
            <li key={stage} className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono-source text-[10px] font-semibold ${
                    done
                      ? "border-verified bg-verified-bg text-verified"
                      : active
                        ? "border-info bg-info-bg text-info"
                        : "border-hairline-strong bg-paper-raised text-ink-faint"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-[11.5px] font-semibold capitalize ${active ? "text-info" : done ? "text-ink" : "text-ink-faint"}`}>
                    {stage}
                  </p>
                  <p className="truncate text-[10px] text-ink-faint">
                    {event?.detail ?? (active ? "Running" : done ? "Completed" : "Waiting")}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
