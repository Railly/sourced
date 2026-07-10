import type { UnverifiedClaim } from "@/lib/types";

export function VerificationPanel({ rejected }: { rejected: UnverifiedClaim[] }) {
  if (rejected.length === 0) {
    return (
      <section
        id="verification-status"
        aria-label="Verification status"
        className="rounded-xl border border-verified-border bg-verified-bg px-5 py-4 flex items-start gap-3"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="mt-0.5 h-5 w-5 shrink-0 text-verified"
        >
          <path
            d="M4 10.5 8 14.5 16 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <p className="text-[14px] font-semibold text-verified">All claims traced to source</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
            A reviewer agent verified every claim in this report against its cited source before
            publication. Nothing here was asserted from model memory.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="verification-status"
      aria-label="Claims rejected by reviewer"
      className="rounded-xl border border-hairline bg-paper-raised px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="mt-0.5 h-5 w-5 shrink-0 text-moderate"
        >
          <path
            d="M10 6.5v4M10 13.5h.01M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <p className="text-[14px] font-semibold text-ink">Claims the reviewer rejected</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
            Before publication, a reviewer agent checked every claim against its source and removed
            anything it could not verify.
          </p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {rejected.map((item) => (
          <li
            key={item.claim_text}
            className="rounded-lg border border-hairline px-4 py-3 bg-paper"
          >
            <p className="text-[13.5px] leading-relaxed text-ink line-through decoration-ink-faint decoration-1">
              {item.claim_text}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              <span className="font-semibold text-ink-faint uppercase tracking-wide text-[11px]">
                Rejected —{" "}
              </span>
              {item.reason}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
