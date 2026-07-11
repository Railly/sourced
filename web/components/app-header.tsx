"use client";

import { formatRetrievedAt } from "@/lib/format-date";

export function AppHeader({
  generatedAt,
  intakeOpen,
  onNewReview,
}: {
  generatedAt: string;
  intakeOpen: boolean;
  onNewReview: () => void;
}) {
  return (
    <header className="border-b border-hairline bg-paper-raised">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:min-h-16 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-serif-display text-[26px] leading-none tracking-[-0.02em] text-ink">
            Sourced
          </span>
          <span className="hidden h-7 w-px bg-hairline-strong sm:block" aria-hidden="true" />
          <span className="hidden truncate text-[13px] font-medium text-ink-muted sm:block">
            Medication safety review
          </span>
        </div>
        <div className="flex items-center gap-3 text-right">
          <button
            type="button"
            onClick={onNewReview}
            className="rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:border-info hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
          >
            {intakeOpen ? "Close entry" : "New review"}
          </button>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-verified">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="m6.8 10.2 2.1 2.1 4.3-4.7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden sm:inline">Verified</span>
          </span>
          <span className="hidden text-[11px] text-ink-faint lg:block">
            {formatRetrievedAt(generatedAt)}
          </span>
        </div>
      </div>
    </header>
  );
}
