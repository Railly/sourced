"use client";

import { Database, Flask, ListChecks, ShieldCheck } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

interface Section {
  id: string;
  icon: ReactNode;
  heading: { en: string; es: string };
  body: { en: string[]; es: string[] };
}

const SECTIONS: Section[] = [
  {
    id: "provenance",
    icon: <ShieldCheck className="h-5 w-5 text-info" weight="regular" />,
    heading: { en: "Every claim traces to a source", es: "Cada afirmación tiene su fuente" },
    body: {
      en: [
        "Sourced reviews a patient's medications for interaction risk and returns a ranked, cited report. It does not diagnose or prescribe.",
        "We never ask the model for a clinical fact. Interactions, severities, and mechanisms come from cited sources and are re-checked by a second, adversarial verifier agent before they reach a clinician. Anything untraceable is refused.",
      ],
      es: [
        "Sourced revisa los medicamentos de un paciente en busca de riesgo de interacción y devuelve un informe rankeado y citado. No diagnostica ni prescribe.",
        "Nunca le pedimos al modelo un dato clínico. Interacciones, severidades y mecanismos vienen de fuentes citadas y un segundo agente verificador adversarial los re-chequea antes de llegar al clínico. Lo no trazable se rechaza.",
      ],
    },
  },
  {
    id: "data",
    icon: <Database className="h-5 w-5 text-info" weight="regular" />,
    heading: { en: "Built on real clinical data, not model memory", es: "Sobre datos clínicos reales, no memoria del modelo" },
    body: {
      en: [
        "DDInter 2.0 — 222,383 interaction rows across 160,235 drug pairs, 1,939 drugs, with graded severity.",
        "openFDA drug labels — FDA-authoritative mechanism text and boxed warnings.",
        "openFDA FAERS — real-world adverse-event co-report signal.",
        "RxNorm / RxNav — drug name normalization, including Spanish to English.",
        "12 real, de-identified case reports from PMC Open Access ground the showcase in actual clinical scenarios.",
      ],
      es: [
        "DDInter 2.0 — 222.383 filas de interacción sobre 160.235 pares, 1.939 fármacos, con severidad graduada.",
        "Etiquetas de openFDA — mecanismo autoritativo de la FDA y advertencias de recuadro.",
        "openFDA FAERS — señal de co-reportes de eventos adversos del mundo real.",
        "RxNorm / RxNav — normalización de nombres, incluido español a inglés.",
        "12 case reports reales y desidentificados de PMC Open Access anclan el showcase en escenarios clínicos reales.",
      ],
    },
  },
  {
    id: "how-it-works",
    icon: <ListChecks className="h-5 w-5 text-info" weight="regular" />,
    heading: { en: "A four-stage pipeline, not a single prompt", es: "Un pipeline de cuatro etapas, no un solo prompt" },
    body: {
      en: [
        "Ingest: medications normalize to RxCUI; unresolved names fail loud rather than get guessed.",
        "Retrieve: DDInter, openFDA labels, and FAERS are pulled deterministically, zero LLM, each result a cited evidence object.",
        "Enrich: a model reads the retrieved FDA labels and names the real pharmacology (CYP inhibitor/substrate, additive QT, anticholinergic burden), quoting the label directly.",
        "Synthesize and verify: Opus 4.8 ranks findings for this patient; a separate adversarial agent strips any claim it cannot trace to a source.",
      ],
      es: [
        "Ingest: los medicamentos se normalizan a RxCUI; los nombres no resueltos fallan ruidosamente en vez de adivinarse.",
        "Retrieve: DDInter, etiquetas de openFDA y FAERS se recuperan determinísticamente, sin LLM, cada resultado un objeto de evidencia citado.",
        "Enrich: un modelo lee las etiquetas FDA recuperadas y nombra la farmacología real (inhibidor/sustrato CYP, QT aditivo, carga anticolinérgica), citando la etiqueta.",
        "Synthesize y verify: Opus 4.8 rankea los hallazgos para este paciente; un agente adversarial separado remueve lo que no traza a una fuente.",
      ],
    },
  },
  {
    id: "claude-science",
    icon: <Flask className="h-5 w-5 text-info" weight="regular" />,
    heading: { en: "When Sourced hits a gap, it routes to research", es: "Cuando Sourced llega a un vacío, lo enruta a investigación" },
    body: {
      en: [
        "Some drug pairs are documented without a graded severity. Some flagged concerns cannot be traced to an existing source. Sourced does not drop these silently.",
        "It generates a precise research brief with Opus and routes it to Claude Science via its local API, opening a live research session across 60+ scientific databases.",
        "Sourced finds the boundary of its own knowledge. Claude Science crosses it.",
      ],
      es: [
        "Algunos pares están documentados sin severidad graduada. Algunas dudas marcadas no se pueden trazar a una fuente. Sourced no las descarta en silencio.",
        "Genera un brief de investigación preciso con Opus y lo enruta a Claude Science por su API local, abriendo una sesión de investigación viva sobre 60+ bases científicas.",
        "Sourced encuentra el borde de su propio conocimiento. Claude Science lo cruza.",
      ],
    },
  },
];

export const LANDING_SECTION_IDS = SECTIONS.map((section) => section.id);

export function LandingSections() {
  const { locale } = useI18n();
  const lang = locale === "es" ? "es" : "en";
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-24 sm:px-8">
      <div className="border-t border-hairline pt-14">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 border-b border-hairline py-10 first:pt-0">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] sm:gap-10">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-info-border bg-info-bg">
                  {section.icon}
                </span>
                <h2 className="font-serif-display text-[22px] leading-tight tracking-[-0.01em] text-ink">
                  {section.heading[lang]}
                </h2>
              </div>
              <div className="space-y-3">
                {section.body[lang].map((paragraph, index) => (
                  <p key={index} className="text-[13.5px] leading-relaxed text-ink-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-center text-[11.5px] leading-relaxed text-ink-faint">
        {lang === "es"
          ? "Los contextos de paciente del showcase son sintéticos o de case reports publicados, desidentificados y de acceso abierto. Sourced es una herramienta de investigación y flujo de trabajo, no un dispositivo clínico certificado."
          : "All patient contexts in the showcase are synthetic or drawn from published, de-identified, open-access case reports. Sourced is a research and workflow tool, not a certified clinical decision support device."}
      </p>
    </div>
  );
}
