interface ClaudeScienceMarkProps {
  className?: string;
  title?: string;
}

/**
 * The Claude Science app mark: a rounded-square tile with the Anthropic
 * terracota gradient (#d97553 -> #db6945, sampled from operon.icns) and the
 * white DNA double helix from the installed app icon. Rendered inline so it
 * carries the app's characteristic color instead of a generic flask glyph.
 */
export function ClaudeScienceMark({ className, title = "Claude Science" }: ClaudeScienceMarkProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title} fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <defs>
        <linearGradient id="cs-tile" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d97553" />
          <stop offset="1" stopColor="#db6945" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="11" fill="url(#cs-tile)" />
      <g stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 11.5c0 5.2 10 5.6 10 12.5s-10 7.3-10 12.5" />
        <path d="M29 11.5c0 5.2-10 5.6-10 12.5s10 7.3 10 12.5" />
        <path d="M20.6 15h6.8" />
        <path d="M18.7 19.4h10.6" />
        <path d="M18.7 28.6h10.6" />
        <path d="M20.6 33h6.8" />
      </g>
    </svg>
  );
}
