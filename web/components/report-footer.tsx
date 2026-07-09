import { formatRetrievedAt } from "@/lib/format-date";

export function ReportFooter({ generatedAt }: { generatedAt: string }) {
  const formatted = formatRetrievedAt(generatedAt);

  return (
    <footer className="border-t border-hairline mt-4">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-8 text-center">
        <p className="font-serif-display text-[15px] italic leading-relaxed text-ink-muted text-pretty">
          Sourced never asks the model for a clinical fact. Every claim is retrieved from a cited
          source and verified.
        </p>
        <p className="mt-3 text-[12px] text-ink-faint font-mono-source">
          Report generated {formatted}
        </p>
      </div>
    </footer>
  );
}
