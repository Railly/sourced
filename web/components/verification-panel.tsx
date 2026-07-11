"use client";

import type { UnverifiedClaim } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export function VerificationPanel({ rejected }: { rejected: UnverifiedClaim[] }) {
  const { t } = useI18n();
  if (rejected.length === 0) {
    return (
      <section
        id="verification-status"
        aria-label={t("verification.label")}
        className="flex items-start gap-3 rounded-xl border border-verified-border bg-verified-bg px-5 py-4"
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
          <p className="text-[14px] font-semibold text-verified">{t("verification.allTraced")}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
            {t("verification.allTracedHelp")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="verification-status"
      aria-label={t("verification.rejectedLabel")}
      className="overflow-hidden rounded-xl border border-hairline bg-paper-raised"
    >
      <div className="flex items-start gap-3 px-5 py-4 lg:px-6">
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
          <p className="text-[14px] font-semibold text-ink">
            {rejected.length === 1
              ? t("verification.removedOne")
              : t("verification.removedMany", { count: rejected.length })}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
            {t("verification.removedHelp")}
          </p>
        </div>
      </div>
      <details className="border-t border-hairline bg-paper">
        <summary className="cursor-pointer px-5 py-3 text-[11px] font-semibold text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-info lg:px-6">
          {t("verification.inspect")}
        </summary>
        <ul className="flex flex-col gap-2.5 border-t border-hairline px-5 py-4 lg:px-6">
          {rejected.map((item) => (
            <li
              key={item.claim_text}
              className="rounded-lg border border-hairline bg-paper-raised px-4 py-3"
            >
              <p className="text-[13.5px] leading-relaxed text-ink line-through decoration-ink-faint decoration-1">
                {item.claim_text}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {t("verification.rejected")}
                </span>
                {item.reason}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
