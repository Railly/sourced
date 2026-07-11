"use client";

import { useEveAgent } from "eve/react";
import type { EveMessage } from "eve/react";
import { useMemo, useState } from "react";
import { SafeReviewLens, buildFallbackSpec } from "@/components/genui/review-lens";
import type { LensMode } from "@/lib/genui/spec";
import type { SafetyReport } from "@/lib/types";

const suggestions: Array<{ mode: LensMode; label: string; prompt: string }> = [
  {
    mode: "priorities",
    label: "Show priorities",
    prompt: "Arrange the highest-priority verified findings for rapid clinical review.",
  },
  {
    mode: "evidence",
    label: "Evidence only",
    prompt: "Show the strongest cited evidence behind the top verified finding.",
  },
  {
    mode: "handoff",
    label: "Prepare handoff",
    prompt: "Prepare a pharmacist handoff from verified findings and clinician questions.",
  },
  {
    mode: "comparison",
    label: "Compare pairwise",
    prompt: "Compare the top pairwise interaction with the patient-specific verified review.",
  },
];

function reportIndex(report: SafetyReport) {
  return {
    findings: report.findings.map((finding, index) => ({
      id: `finding-${index}`,
      status: finding.status,
      severity: finding.severity,
      drugs: finding.drugs,
      evidenceIds: finding.evidence_ids,
    })),
    evidence: report.evidence.map((evidence) => ({
      id: evidence.id,
      source: evidence.source_name,
      field: evidence.exact_field ?? null,
    })),
    questionIndexes: report.questions_for_clinician.map((_, index) => index),
  };
}

function latestToolSpec(messages: readonly EveMessage[]): unknown {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (
        part?.type === "dynamic-tool" &&
        part.toolName === "render_review_lens" &&
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "spec" in part.output
      ) {
        return (part.output as { spec: unknown }).spec;
      }
    }
  }
  return null;
}

export function ReviewAssistant({ report }: { report: SafetyReport }) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<LensMode>("priorities");
  const [submitted, setSubmitted] = useState(false);
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const generatedSpec = latestToolSpec(agent.data.messages);
  const fallback = useMemo(() => buildFallbackSpec(report, mode), [mode, report]);
  const spec = generatedSpec ?? (submitted && agent.status === "error" ? fallback : null);

  async function send(prompt: string, nextMode: LensMode): Promise<void> {
    if (isBusy) return;
    setMode(nextMode);
    setSubmitted(true);
    await agent.send({
      message: prompt,
      clientContext: { verifiedReportIndex: reportIndex(report) },
    });
  }

  return (
    <section id="assistant" aria-labelledby="assistant-heading" className="scroll-mt-20">
      <div className="overflow-hidden rounded-xl border border-hairline bg-paper-raised">
        <div className="grid min-w-0 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="min-w-0 border-b border-hairline px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="assistant-heading" className="font-serif-display text-[21px] text-ink">
                  Adaptive review lens
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  Verified IDs are arranged through a constrained component catalog. It cannot create clinical copy.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-info-border bg-info-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-info">
                Source-bound
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.mode}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void send(suggestion.prompt, suggestion.mode)}
                  className="rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:border-info hover:text-info disabled:cursor-wait disabled:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const prompt = input.trim();
                if (!prompt) return;
                setInput("");
                void send(prompt, mode);
              }}
            >
              <label htmlFor="review-lens-prompt" className="sr-only">
                Ask for a verified-report view
              </label>
              <input
                id="review-lens-prompt"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Arrange this verified report…"
                disabled={isBusy}
                className="min-w-0 flex-1 rounded-md border border-hairline-strong bg-paper px-3 py-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-info focus:ring-2 focus:ring-info-border disabled:cursor-wait"
              />
              <button
                type="submit"
                disabled={isBusy || input.trim().length === 0}
                className="rounded-md bg-ink px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-info disabled:cursor-not-allowed disabled:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
              >
                {isBusy ? "Arranging…" : "Arrange"}
              </button>
            </form>

            <div className="mt-3 flex items-center justify-between gap-3 text-[10.5px] text-ink-faint" aria-live="polite">
              <span>
                {agent.status === "error"
                  ? "Agent unavailable. Showing the deterministic safe fallback."
                  : isBusy
                    ? "Selecting components from verified report IDs"
                    : "Catalog-bound components · no arbitrary text or URLs"}
              </span>
              {submitted ? (
                <button
                  type="button"
                  onClick={() => {
                    agent.reset();
                    setSubmitted(false);
                  }}
                  className="font-semibold hover:text-info"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-64 min-w-0 bg-paper px-4 py-4 sm:px-6 sm:py-6">
            {spec ? (
              <SafeReviewLens report={report} spec={spec} />
            ) : (
              <div className="flex min-h-52 items-center justify-center border border-dashed border-hairline-strong px-6 text-center">
                <div className="max-w-md">
                  <p className="font-serif-display text-[18px] text-ink">Choose a review lens</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                    The agent may choose arrangement and emphasis. Every rendered clinical value still resolves to the canonical verified packet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
