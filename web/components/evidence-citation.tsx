"use client";

import { useId, useState } from "react";
import type { EvidenceObject } from "@/lib/types";
import { formatRetrievedAt } from "@/lib/format-date";

const SOURCE_LABEL: Record<EvidenceObject["source_name"], string> = {
  "openFDA-label": "FDA Label",
  "openFDA-FAERS": "FDA FAERS",
  DDInter: "DDInter",
  RxNorm: "RxNorm",
  SIDER: "SIDER",
  MedlinePlus: "MedlinePlus",
};

export function EvidenceCitation({ evidence, index }: { evidence: EvidenceObject; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border border-hairline rounded-lg bg-paper-raised overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1 rounded-lg"
      >
        <span
          className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-paper border border-hairline-strong text-[10px] font-mono-source text-ink-muted"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 flex items-baseline gap-2">
          <span className="text-[11px] font-semibold tracking-wide uppercase text-ink-faint shrink-0">
            {SOURCE_LABEL[evidence.source_name]}
          </span>
          <span className="min-w-0 truncate text-sm text-ink-muted">{evidence.claim_text}</span>
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
          <div className="px-3.5 pb-3.5 pt-1 border-t border-hairline">
            {evidence.quoted_text ? (
              <blockquote className="mt-2.5 rounded-md bg-paper border-l-2 border-info px-3.5 py-3 font-mono-source text-[12.5px] leading-relaxed text-ink max-h-56 overflow-y-auto">
                {evidence.quoted_text}
              </blockquote>
            ) : null}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] text-ink-muted">
              {evidence.exact_field ? (
                <>
                  <dt className="text-ink-faint">Field</dt>
                  <dd className="font-mono-source">{evidence.exact_field}</dd>
                </>
              ) : null}
              <dt className="text-ink-faint">Retrieved</dt>
              <dd>{formatRetrievedAt(evidence.retrieved_at)}</dd>
            </dl>
            <a
              href={evidence.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-info hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1 rounded"
            >
              View source
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
  );
}
