"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { ClaudeScienceMark } from "@/components/claude-science-mark";
import { useI18n } from "@/lib/i18n";

export const LANDING_SECTION_IDS = ["data", "how-it-works", "claude-science"];

interface Copy {
  en: string;
  es: string;
}

function pick(copy: Copy, lang: "en" | "es") {
  return copy[lang];
}

const STATS: Array<{ value: string; label: Copy }> = [
  { value: "222,383", label: { en: "interaction rows", es: "filas de interacción" } },
  { value: "160,235", label: { en: "graded drug pairs", es: "pares con severidad" } },
  { value: "4", label: { en: "cited data sources", es: "fuentes citadas" } },
  { value: "2", label: { en: "adversarial agents", es: "agentes adversariales" } },
];

const SOURCES: Array<{ name: string; note: Copy }> = [
  { name: "DDInter 2.0", note: { en: "graded pair severity", es: "severidad por par" } },
  { name: "openFDA labels", note: { en: "FDA mechanism text", es: "mecanismo FDA" } },
  { name: "openFDA FAERS", note: { en: "adverse-event signal", es: "señal de eventos adversos" } },
  { name: "RxNorm / RxNav", note: { en: "name normalization", es: "normalización de nombres" } },
];

const PIPELINE: Array<{ step: string; title: Copy; body: Copy }> = [
  {
    step: "01",
    title: { en: "Ingest", es: "Ingest" },
    body: {
      en: "Meds normalize to RxCUI. Unresolved names fail loud, never guessed.",
      es: "Los meds se normalizan a RxCUI. Los no resueltos fallan fuerte, nunca se adivinan.",
    },
  },
  {
    step: "02",
    title: { en: "Retrieve", es: "Retrieve" },
    body: {
      en: "DDInter, labels and FAERS pulled deterministically. Zero LLM. Each result cited.",
      es: "DDInter, etiquetas y FAERS de forma determinística. Sin LLM. Cada resultado citado.",
    },
  },
  {
    step: "03",
    title: { en: "Enrich", es: "Enrich" },
    body: {
      en: "A model reads the labels and names the CYP mechanism, quoting the source.",
      es: "Un modelo lee las etiquetas y nombra el mecanismo CYP, citando la fuente.",
    },
  },
  {
    step: "04",
    title: { en: "Verify", es: "Verify" },
    body: {
      en: "Opus ranks findings. A second agent strips anything it cannot trace.",
      es: "Opus rankea. Un segundo agente remueve lo que no puede trazar.",
    },
  },
];

const HEADING = {
  data: { en: "Real clinical data, not model memory", es: "Datos clínicos reales, no memoria del modelo" },
  pipeline: { en: "Four stages, one cited trail", es: "Cuatro etapas, un rastro citado" },
  science: { en: "Hits a gap, routes to research", es: "Llega a un vacío, enruta a investigación" },
  scienceBody: {
    en: "Some pairs have no graded severity. Sourced writes a research brief with Opus and opens it in Claude Science, live across 60+ scientific databases.",
    es: "Algunos pares no tienen severidad graduada. Sourced escribe un brief con Opus y lo abre en Claude Science, en vivo sobre 60+ bases científicas.",
  },
  disclaimer: {
    en: "Showcase patients are synthetic or from published, de-identified, open-access case reports. A research and workflow tool, not a certified clinical device.",
    es: "Los pacientes del showcase son sintéticos o de case reports publicados, desidentificados y de acceso abierto. Herramienta de investigación y flujo, no dispositivo clínico certificado.",
  },
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">{children}</p>;
}

export function LandingSections() {
  const { locale } = useI18n();
  const lang: "en" | "es" = locale === "es" ? "es" : "en";

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-24 sm:px-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.value} className="bg-paper-raised px-5 py-6">
            <p className="font-serif-display text-[30px] leading-none tracking-[-0.02em] text-ink sm:text-[34px]">
              {stat.value}
            </p>
            <p className="mt-2 text-[12px] leading-snug text-ink-muted">{pick(stat.label, lang)}</p>
          </div>
        ))}
      </div>

      <section id="data" className="scroll-mt-24 pt-16">
        <Label>{lang === "es" ? "Fuentes" : "Data sources"}</Label>
        <h2 className="mt-2 font-serif-display text-[24px] leading-tight tracking-[-0.01em] text-ink">
          {pick(HEADING.data, lang)}
        </h2>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2">
          {SOURCES.map((source) => (
            <div key={source.name} className="flex items-baseline justify-between gap-4 bg-paper-raised px-5 py-4">
              <span className="font-mono text-[13px] text-ink">{source.name}</span>
              <span className="text-right text-[12px] text-ink-faint">{pick(source.note, lang)}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 pt-16">
        <Label>{lang === "es" ? "Pipeline" : "Pipeline"}</Label>
        <h2 className="mt-2 font-serif-display text-[24px] leading-tight tracking-[-0.01em] text-ink">
          {pick(HEADING.pipeline, lang)}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((stage) => (
            <div key={stage.step} className="rounded-xl border border-hairline bg-paper-raised px-5 py-5">
              <p className="font-mono text-[12px] text-ink-faint">{stage.step}</p>
              <p className="mt-2 font-serif-display text-[17px] tracking-[-0.01em] text-ink">{pick(stage.title, lang)}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{pick(stage.body, lang)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="claude-science" className="scroll-mt-24 pt-16">
        <div className="rounded-xl border border-info-border bg-info-bg px-6 py-7 sm:px-8">
          <div className="flex items-center gap-2.5">
            <ClaudeScienceMark className="h-6 w-6" />
            <Label>Claude Science</Label>
          </div>
          <h2 className="mt-3 max-w-2xl font-serif-display text-[24px] leading-tight tracking-[-0.01em] text-ink">
            {pick(HEADING.science, lang)}
          </h2>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
            {pick(HEADING.scienceBody, lang)}
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-info">
            {lang === "es" ? "Brief generado con Opus" : "Brief generated with Opus"}
            <ArrowRight className="h-3.5 w-3.5" weight="bold" />
          </span>
        </div>
      </section>

      <p className="mt-14 max-w-2xl text-[11.5px] leading-relaxed text-ink-faint">{pick(HEADING.disclaimer, lang)}</p>
    </div>
  );
}
