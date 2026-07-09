export function PatientHeader({
  summary,
  drugs,
}: {
  summary: string;
  drugs: string[];
}) {
  return (
    <header className="border-b border-hairline bg-paper-raised">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-8 sm:py-10">
        <div className="flex items-center gap-2.5">
          <SourcedMark />
          <span className="text-[13px] font-semibold tracking-wide uppercase text-ink-faint">
            Medication Safety Review
          </span>
        </div>

        <p className="mt-5 font-serif-display text-[17px] sm:text-[18px] leading-relaxed text-ink text-pretty">
          {summary}
        </p>

        {drugs.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Active medications">
            {drugs.map((drug) => (
              <span
                key={drug}
                className="rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12.5px] font-medium text-ink-muted"
              >
                {drug}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function SourcedMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5 text-ink">
      <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.5 10.5 9 13l5-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
