import type { SafetyReport } from "@/lib/types";

const stages = ["ingest", "retrieve", "synthesize", "verify"] as const;

function stageLabel(stage: (typeof stages)[number]): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

interface ManifestSummary {
  release: string;
  license: string;
  coverage: { files: string[] };
}

export function PipelineStatus({
  pipeline,
  manifest,
}: {
  pipeline: SafetyReport["pipeline"];
  manifest: ManifestSummary;
}) {
  const coverage = pipeline?.ddinter;

  return (
    <section aria-labelledby="pipeline-heading" className="border-y border-hairline py-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="pipeline-heading" className="text-[12px] font-semibold text-ink">
                Verified pipeline
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-faint">
                {pipeline?.mode === "live" ? "Live source-backed run completed" : "Audited replay loaded"}
              </p>
            </div>
            <span className="rounded-full border border-verified-border bg-verified-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-verified">
              4 stages verified
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-4 gap-2">
            {stages.map((stage, index) => {
              const done = pipeline?.stages.includes(stage) ?? false;
              return (
                <li key={stage} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold sm:h-6 sm:w-6 sm:text-[10px] ${
                        done
                          ? "border-verified bg-verified-bg text-verified"
                          : "border-hairline-strong text-ink-faint"
                      }`}
                    >
                      {done ? "✓" : index + 1}
                    </span>
                    <span className={`truncate text-[10px] font-medium sm:text-[12px] ${done ? "text-ink" : "text-ink-faint"}`}>
                      {stageLabel(stage)}
                    </span>
                  </div>
                  <div className="mt-2 h-px bg-hairline" aria-hidden="true">
                    <div
                      className={`h-px bg-verified ${done ? "w-full" : "w-0"}`}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {coverage ? (
          <div className="shrink-0 xl:w-[390px]">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
              <CoverageValue value={coverage.source_rows.toLocaleString()} label="Source rows" />
              <CoverageValue value={coverage.unique_pairs.toLocaleString()} label="Unique pairs" />
              <CoverageValue value={coverage.unique_drugs.toLocaleString()} label="Drugs" />
            </div>
            <a
              href="/data/ddinter-manifest.json"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-right text-[10.5px] text-ink-faint hover:text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              {manifest.release} · {manifest.coverage.files.length} files · {manifest.license} · manifest
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CoverageValue({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-paper-raised px-3 py-3 text-center">
      <p className="font-mono-source text-[13px] font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  );
}
