const links = [
  ["overview", "Overview"],
  ["assistant", "Assistant"],
  ["findings", "Findings"],
  ["comparison", "Comparison"],
  ["questions", "Questions"],
] as const;

export function SectionNav() {
  return (
    <nav
      aria-label="Review sections"
      className="sticky top-0 z-40 border-b border-hairline bg-paper-raised/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-7 overflow-x-auto px-5 sm:px-8">
        {links.map(([id, label], index) => (
          <a
            key={id}
            href={`#${id}`}
            className={`relative shrink-0 py-3 text-[13px] font-medium transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 ${
              index === 0 ? "text-ink" : "text-ink-muted"
            }`}
          >
            {label}
            {index === 0 ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden="true" />
            ) : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
