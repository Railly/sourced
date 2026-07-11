"use client";

import { useId, useState } from "react";
import type { EvidenceObject } from "@/lib/types";
import { formatRetrievedAt } from "@/lib/format-date";
import { evidencePassage } from "@/lib/report";
import { useI18n } from "@/lib/i18n";

const SOURCE_LABEL: Record<EvidenceObject["source_name"], string> = {
  "openFDA-label": "FDA Label",
  "openFDA-FAERS": "FDA FAERS",
  DDInter: "DDInter",
  RxNorm: "RxNorm",
  SIDER: "SIDER",
  MedlinePlus: "MedlinePlus",
};

export function EvidenceCitation({
  evidence,
  index,
  drugs,
  defaultOpen = false,
}: {
  evidence: EvidenceObject;
  index: number;
  drugs: string[];
  defaultOpen?: boolean;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const passage = evidencePassage(evidence, drugs);

  return (
    <div className="overflow-hidden border-t border-hairline first:border-t-0">
      <button
        type="button"
        data-testid="evidence-citation"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-1 py-3 text-left hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1"
      >
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-paper text-[10px] font-mono-source text-ink-muted"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 items-baseline gap-2 sm:flex">
          <span className="text-[11px] font-semibold tracking-wide uppercase text-ink-faint shrink-0">
            {SOURCE_LABEL[evidence.source_name]}
          </span>
          <span className="block min-w-0 truncate text-[12.5px] text-ink-muted">{evidence.claim_text}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={`shrink-0 h-4 w-4 text-ink-faint transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-hairline px-1 pb-4 pt-3">
            {passage ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {t("evidence.supportingPassage")}
                </p>
                <blockquote className="mt-2 rounded-md border border-info-border bg-info-bg px-4 py-3 font-mono-source text-[12px] leading-relaxed text-ink">
                  {passage}
                </blockquote>
              </div>
            ) : null}
            {evidence.quoted_text && evidence.quoted_text !== passage ? (
              <details className="mt-3">
                <summary className="w-fit cursor-pointer text-[12px] font-medium text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1">
                  {t("evidence.fullText")}
                </summary>
                <blockquote className="mt-2 max-h-64 overflow-y-auto rounded-md bg-paper px-4 py-3 font-mono-source text-[11.5px] leading-relaxed text-ink-muted">
                  {evidence.quoted_text}
                </blockquote>
              </details>
            ) : null}
            <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                {evidence.exact_field ? (
                  <>
                    <dt className="text-ink-faint">{t("evidence.field")}</dt>
                    <dd className="font-mono-source">{evidence.exact_field}</dd>
                  </>
                ) : null}
                {evidence.source_version ? (
                  <>
                    <dt className="text-ink-faint">{t("evidence.version")}</dt>
                    <dd className="font-mono-source">{evidence.source_version}</dd>
                  </>
                ) : null}
                <dt className="text-ink-faint">{t("evidence.retrieved")}</dt>
                <dd>{formatRetrievedAt(evidence.retrieved_at, locale)}</dd>
              </dl>
              <a
                href={evidence.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-info-border bg-paper-raised px-3 py-2 text-[12px] font-semibold text-info hover:bg-info-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1"
              >
                {t("evidence.viewSource")}
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                  <path
                    d="M6 4H4.5A1.5 1.5 0 0 0 3 5.5v6A1.5 1.5 0 0 0 4.5 13h6a1.5 1.5 0 0 0 1.5-1.5V10M9 3h4v4M13 3 7 9"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
