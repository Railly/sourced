"use client";

import { Flask } from "@phosphor-icons/react";
import type { ResearchCandidate } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export function ResearchQueue({
  candidates,
  totalKnownUnknown = 0,
}: {
  candidates: ResearchCandidate[];
  totalKnownUnknown?: number;
}) {
  const { t } = useI18n();
  if (candidates.length === 0) return null;

  const knownUnknownShown = candidates.filter((item) => item.tier === "known-unknown").length;
  const hiddenKnownUnknown = Math.max(0, totalKnownUnknown - knownUnknownShown);

  return (
    <section
      id="research-queue"
      aria-labelledby="research-queue-heading"
      className="overflow-hidden rounded-xl border border-info-border bg-info-bg"
    >
      <div className="flex items-start gap-3 px-5 py-4 lg:px-6">
        <Flask aria-hidden="true" weight="regular" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div>
          <h2 id="research-queue-heading" className="text-[14px] font-semibold text-ink">
            {candidates.length === 1
              ? t("research.routedOne")
              : t("research.routedMany", { count: candidates.length })}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{t("research.help")}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5 border-t border-info-border bg-paper px-5 py-4 lg:px-6">
        {candidates.map((item, index) => (
          <li
            key={`${item.source}-${index}`}
            className="rounded-lg border border-hairline bg-paper-raised px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                {item.tier === "known-unknown" ? t("research.tierKnownUnknown") : t("research.tierUnresolved")}
              </span>
              {item.drugs.length > 0 ? (
                <span className="font-mono-source text-[12px] text-ink">{item.drugs.join(" + ")}</span>
              ) : null}
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{item.question}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {t("research.basis")}
              </span>
              {item.reason} <span className="text-ink-faint">· {item.source}</span>
            </p>
          </li>
        ))}
      </ul>
      {hiddenKnownUnknown > 0 ? (
        <p className="border-t border-info-border px-5 py-3 text-[12px] text-ink-muted lg:px-6">
          {t("research.moreUnquantified", { count: hiddenKnownUnknown })}
        </p>
      ) : null}
    </section>
  );
}
