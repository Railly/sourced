"use client";

import { ArrowSquareOut, BookOpenText, FilePdf, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export interface PublishedCase {
  id: string;
  pmcid: string;
  title: string;
  domain: string;
  source_url: string;
  license: "CC BY" | "CC BY-NC-SA";
  pdf_url: string;
  safety_focus: string;
}

export function PublishedCaseGallery({
  cases,
  open,
  busy,
  onClose,
  onLoad,
}: {
  cases: PublishedCase[];
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onLoad: (item: PublishedCase) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const visibleCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cases;
    return cases.filter((item) =>
      [item.title, item.domain, item.pmcid, item.safety_focus]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [cases, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button type="button" aria-label={t("gallery.close")} onClick={onClose} className="absolute inset-0" />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="published-cases-heading"
        className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-hairline bg-paper-raised shadow-2xl sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-hairline bg-paper-raised px-5 py-5 sm:px-6">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-info-border bg-info-bg text-info">
              <BookOpenText className="h-5 w-5" weight="regular" />
            </span>
            <div>
              <h2 id="published-cases-heading" className="font-serif-display text-[23px] text-ink">{t("gallery.title")}</h2>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
                {t("gallery.description")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("gallery.closeShort")}
            onClick={onClose}
            className="rounded-md p-2 text-ink-muted hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            <X className="h-5 w-5" weight="regular" />
          </button>
        </header>

        <div className="sticky top-[105px] z-[9] border-b border-hairline bg-paper-raised px-5 py-3 sm:top-[93px] sm:px-6">
          <label className="flex items-center gap-2 rounded-md border border-hairline-strong bg-paper px-3 py-2 focus-within:border-info focus-within:ring-2 focus-within:ring-info-border">
            <MagnifyingGlass className="h-4 w-4 shrink-0 text-ink-faint" weight="regular" />
            <span className="sr-only">{t("gallery.search")}</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("gallery.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="text-[10px] font-semibold text-ink-faint">{visibleCases.length}/{cases.length}</span>
          </label>
        </div>

        <div className="divide-y divide-hairline px-5 sm:px-6">
          {visibleCases.map((item) => (
            <article key={item.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[9.5px] font-semibold uppercase tracking-wide">
                  <span className="rounded-full border border-info-border bg-info-bg px-2 py-0.5 text-info">{item.domain}</span>
                  <span className="text-verified">{item.license}</span>
                  <span className="text-ink-faint">{item.pmcid}</span>
                </div>
                <h3 className="mt-2 font-serif-display text-[17px] leading-snug text-ink">{item.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                  {t("gallery.safetyFocus", { focus: item.safety_focus })}
                </p>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-info hover:underline"
                >
                  {t("gallery.viewSource")} <ArrowSquareOut className="h-3.5 w-3.5" weight="regular" />
                </a>
              </div>
              <button
                type="button"
                data-testid={`load-case-${item.id}`}
                disabled={busy}
                onClick={() => onLoad(item)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-hairline-strong bg-paper px-4 py-2.5 text-[11.5px] font-semibold text-ink hover:border-info hover:text-info disabled:cursor-wait disabled:opacity-50"
              >
                <FilePdf className="h-4 w-4 text-major" weight="regular" />
                {t("gallery.loadPdf")}
              </button>
            </article>
          ))}
          {visibleCases.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-muted">{t("gallery.noResults")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
