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

type Translate = ReturnType<typeof useI18n>["t"];

// Localizes a DDInter severity word (Major/Moderate/Minor/Unknown) for display.
// The stored value is the canonical English level the verifier checks; only the
// rendered label is translated. Unknown severity words pass through verbatim.
function severityLabel(value: string, t: Translate): string {
  const key = value.trim().toLowerCase();
  if (key === "major" || key === "moderate" || key === "minor" || key === "unknown") {
    return t(`severity.${key}`);
  }
  return value.trim();
}

// DDInter records are stored in a raw column form (`Drug_A: X; Drug_B: Y;
// Level: Z`) that reads like a database dump. Detect that exact shape and lay
// it out as readable key/value pairs. This is presentation only over a known,
// structured record: drug names stay verbatim, the severity WORD is localized,
// and the raw string stays available verbatim under "Full text".
function ddinterFields(passage: string, t: Translate): Array<{ label: string; value: string }> | null {
  const match = passage.match(
    /^\s*Drug_A:\s*(.+?);\s*Drug_B:\s*(.+?);\s*Level:\s*(.+?)\s*$/i,
  );
  if (!match) return null;
  return [
    { label: t("evidence.drugA"), value: match[1]!.trim() },
    { label: t("evidence.drugB"), value: match[2]!.trim() },
    { label: t("evidence.severity"), value: severityLabel(match[3]!.trim(), t) },
  ];
}

function SupportingPassage({ passage, t }: { passage: string; t: Translate }) {
  const fields = ddinterFields(passage, t);
  if (fields) {
    return (
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border border-info-border bg-info-bg px-4 py-3">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="text-[11px] font-medium text-ink-faint">{field.label}</dt>
            <dd className="text-[12.5px] font-semibold text-ink">{field.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <blockquote className="mt-2 rounded-md border border-info-border bg-info-bg px-4 py-3 font-mono-source text-[12px] leading-relaxed text-ink">
      {passage}
    </blockquote>
  );
}

// The evidence subtitle. A DDInter claim_text ("DDInter severity for X + Y: Z")
// is a synthetic summary we generate, so it is re-rendered in the active locale
// with the severity word localized. Any other claim_text (verbatim source
// text) is shown as-is.
function claimSubtitle(claimText: string, t: Translate): string {
  const match = claimText.match(/^DDInter severity for (.+?) \+ (.+?): (.+)$/);
  if (!match) return claimText;
  return t("evidence.ddinterClaim", { a: match[1]!, b: match[2]!, level: severityLabel(match[3]!, t) });
}

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
          <span className="block min-w-0 truncate text-[12.5px] text-ink-muted">{claimSubtitle(evidence.claim_text, t)}</span>
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
                <SupportingPassage passage={passage} t={t} />
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
