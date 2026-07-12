"use client";

import { ArrowUpRight, CircleNotch, Flask } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { ResearchCandidate } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

type RouteState = { status: "idle" | "routing" | "done" | "error"; url?: string; message?: string };

export function ResearchQueue({
  candidates,
  totalKnownUnknown = 0,
  patientSummary,
}: {
  candidates: ResearchCandidate[];
  totalKnownUnknown?: number;
  patientSummary?: string;
}) {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [routes, setRoutes] = useState<Record<number, RouteState>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/route-to-science")
      .then((response) => response.json())
      .then((data: { available?: boolean }) => {
        if (active) setAvailable(Boolean(data.available));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (candidates.length === 0) return null;

  const knownUnknownShown = candidates.filter((item) => item.tier === "known-unknown").length;
  const hiddenKnownUnknown = Math.max(0, totalKnownUnknown - knownUnknownShown);

  async function route(index: number, candidate: ResearchCandidate): Promise<void> {
    setRoutes((current) => ({ ...current, [index]: { status: "routing" } }));
    try {
      const response = await fetch("/api/route-to-science", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate, patientSummary }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t("science.error"));
      setRoutes((current) => ({ ...current, [index]: { status: "done", url: data.projectUrl } }));
      window.open(data.projectUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setRoutes((current) => ({
        ...current,
        [index]: { status: "error", message: error instanceof Error ? error.message : t("science.error") },
      }));
    }
  }

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
        {candidates.map((item, index) => {
          const state = routes[index] ?? { status: "idle" as const };
          return (
            <li key={`${item.source}-${index}`} className="rounded-lg border border-hairline bg-paper-raised px-4 py-3">
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
              {available ? (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void route(index, item)}
                    disabled={state.status === "routing" || state.status === "done"}
                    className="inline-flex items-center gap-1.5 rounded-md bg-info px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#173f70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:opacity-60"
                  >
                    {state.status === "routing" ? (
                      <CircleNotch aria-hidden="true" weight="bold" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Flask aria-hidden="true" weight="fill" className="h-3.5 w-3.5" />
                    )}
                    {state.status === "done" ? t("science.opened") : state.status === "routing" ? t("science.routing") : t("science.route")}
                  </button>
                  {state.status === "done" && state.url ? (
                    <a
                      href={state.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-info hover:underline"
                    >
                      {t("science.open")}
                      <ArrowUpRight aria-hidden="true" weight="bold" className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {state.status === "error" ? (
                    <span className="text-[11.5px] text-major" role="alert">{state.message}</span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hiddenKnownUnknown > 0 ? (
        <p className="border-t border-info-border px-5 py-3 text-[12px] text-ink-muted lg:px-6">
          {t("research.moreUnquantified", { count: hiddenKnownUnknown })}
        </p>
      ) : null}
    </section>
  );
}
