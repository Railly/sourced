"use client";

import type { Spec } from "@json-render/core";
import { useUIStream } from "@json-render/react";
import {
  ArrowCounterClockwise,
  BookOpenText,
  CheckCircle,
  CircleNotch,
  Copy,
  FilePdf,
  Question,
  Sparkle,
} from "@phosphor-icons/react";
import { useEveAgent, type EveMessage } from "eve/react";
import { useMemo, useState } from "react";
import { buildCompletedReviewSpec, buildRunningReviewSpec } from "@/lib/genui/completed-spec";
import { LiveReviewCanvas, reportFromLiveSpec } from "@/components/genui/live-review-canvas";
import { SafeReviewLens, buildFallbackSpec } from "@/components/genui/review-lens";
import { MultimodalComposer } from "@/components/multimodal-composer";
import { PatientPacketEditor } from "@/components/patient-packet-editor";
import { PublishedCaseGallery, type PublishedCase } from "@/components/published-case-gallery";
import { ResearchQueue } from "@/components/research-queue";
import { WorkspaceStageRail, type WorkspacePhase } from "@/components/workspace-stage-rail";
import type { LensMode } from "@/lib/genui/spec";
import { languageInstruction, type Locale, useI18n } from "@/lib/i18n";
import { intakeExtractionSchema, type IntakeAmbiguity, type IntakeExtraction } from "@/lib/intake";
import {
  draftFromCase,
  emptyReviewCase,
  serializeReviewCase,
  type ReviewCaseDraft,
  type ReviewCaseInput,
} from "@/lib/review-case";
import type { SafetyReport } from "@/lib/types";
import { packetConfirmationBlocker } from "@/lib/workspace-ux";

function quickActions(t: ReturnType<typeof useI18n>["t"]): Array<{ label: string; mode: LensMode; prompt: string }> {
  return [
    { label: t("quick.priorities"), mode: "priorities", prompt: "Arrange the highest-priority verified findings for rapid clinical review." },
    { label: t("quick.evidence"), mode: "evidence", prompt: "Show the strongest cited evidence behind the top verified finding." },
    { label: t("quick.handoff"), mode: "handoff", prompt: "Prepare a pharmacist handoff from verified findings and clinician questions." },
    { label: t("quick.compare"), mode: "comparison", prompt: "Compare the top pairwise interaction with the patient-specific verified review." },
  ];
}

function latestAgentText(messages: readonly EveMessage[]): string | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message || message.role !== "assistant") continue;
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return null;
}

interface PrecomputedReview {
  intake: IntakeExtraction | null;
  report: SafetyReport;
}

async function loadPrecomputedReview(id: string, locale: Locale): Promise<PrecomputedReview | null> {
  try {
    const response = await fetch(`/data/reviews/${id}.${locale}.json`);
    if (!response.ok) return null;
    const payload = (await response.json()) as PrecomputedReview;
    if (!payload?.report) return null;
    return payload;
  } catch {
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function latestToolSpec(messages: readonly EveMessage[]): unknown {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (
        part?.type === "dynamic-tool" &&
        part.toolName === "render_review_lens" &&
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "spec" in part.output
      ) {
        return (part.output as { spec: unknown }).spec;
      }
    }
  }
  return null;
}

function reportIndex(report: SafetyReport) {
  return {
    findings: report.findings.map((finding, index) => ({
      id: `finding-${index}`,
      status: finding.status,
      severity: finding.severity,
      drugs: finding.drugs,
      evidenceIds: finding.evidence_ids,
    })),
    evidence: report.evidence.map((evidence) => ({
      id: evidence.id,
      source: evidence.source_name,
      field: evidence.exact_field ?? null,
    })),
    questionIndexes: report.questions_for_clinician.map((_, index) => index),
  };
}

function demoAmbiguity(locale: Locale): IntakeAmbiguity {
  return {
    id: "duplicate-warfarin",
    field: "medications",
    question: locale === "es"
      ? "La fuente incluye warfarina y Coumadin. ¿Son una sola entrada del mismo medicamento o dos órdenes diferentes?"
      : "The source lists warfarin and Coumadin. Are these one intended medication entry or two separate orders?",
  };
}

function pipelineErrorFromSpec(spec: Spec | null, fallback: string): string | undefined {
  if (!spec) return undefined;
  for (const element of Object.values(spec.elements)) {
    if (element.type !== "PipelineProgress") continue;
    const props = element.props as { status?: unknown; detail?: unknown };
    if (props.status === "error") {
      return typeof props.detail === "string" && props.detail.trim()
        ? props.detail
        : fallback;
    }
  }
  return undefined;
}

function SourceExtractionStatus({ sourceName }: { sourceName: string }) {
  const { t } = useI18n();
  return (
    <div
      className="mx-auto flex min-h-[420px] w-full max-w-3xl items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="source-extraction-status"
    >
      <div className="w-full rounded-xl border border-info-border bg-paper-raised px-6 py-7 shadow-[0_18px_55px_rgba(20,24,28,0.06)] sm:px-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info-bg text-info">
            <CircleNotch className="h-6 w-6 animate-spin motion-reduce:animate-none" weight="bold" />
          </span>
          <div>
            <p className="font-serif-display text-[23px] leading-tight text-ink">{t("extract.title")}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              {t("extract.description", { source: sourceName })}
            </p>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          <li className="rounded-lg border border-verified-border bg-verified-bg px-3 py-3">
            <CheckCircle className="h-4 w-4 text-verified" weight="fill" />
            <p className="mt-2 text-[11.5px] font-semibold text-ink">{t("extract.received")}</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">{t("extract.receivedHelp")}</p>
          </li>
          <li className="rounded-lg border border-info-border bg-info-bg px-3 py-3">
            <CircleNotch className="h-4 w-4 animate-spin text-info motion-reduce:animate-none" weight="bold" />
            <p className="mt-2 text-[11.5px] font-semibold text-ink">{t("extract.fields")}</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">{t("extract.fieldsHelp")}</p>
          </li>
          <li className="rounded-lg border border-hairline bg-paper px-3 py-3">
            <span className="block h-4 w-4 rounded-full border border-hairline-strong" />
            <p className="mt-2 text-[11.5px] font-semibold text-ink-muted">{t("extract.anchors")}</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">{t("extract.anchorsHelp")}</p>
          </li>
        </ol>
      </div>
    </div>
  );
}

export function AgentWorkspace({
  goldenCase,
  publishedCases,
}: {
  goldenCase: ReviewCaseInput;
  publishedCases: PublishedCase[];
}) {
  const { locale, setLocale, t } = useI18n();
  const [phase, setPhase] = useState<WorkspacePhase>("empty");
  const [draft, setDraft] = useState<ReviewCaseDraft>(() => emptyReviewCase());
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState(() => t("workspace.clinicalSource"));
  const [deidentified, setDeidentified] = useState(false);
  const [ambiguities, setAmbiguities] = useState<IntakeAmbiguity[]>([]);
  const [answers, setAnswers] = useState<Array<{ question: string; answer: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [lensMode, setLensMode] = useState<LensMode>("priorities");
  const [lensRequested, setLensRequested] = useState(false);
  const [mobilePane, setMobilePane] = useState<"eve" | "canvas">("eve");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingPacket, setEditingPacket] = useState(false);
  const [precomputedReport, setPrecomputedReport] = useState<SafetyReport | null>(null);
  const [staticSpec, setStaticSpec] = useState<Spec | null>(null);
  const [highlightClarification, setHighlightClarification] = useState(false);
  const agent = useEveAgent();
  const agentBusy = agent.status === "submitted" || agent.status === "streaming";
  const ui = useUIStream({
    api: "/api/review-ui",
    onComplete: (spec) => {
      if (reportFromLiveSpec(spec)) {
        setPhase("complete");
        return;
      }
      const pipelineError = pipelineErrorFromSpec(spec, t("error.reviewPaused"));
      if (pipelineError) {
        setError(pipelineError);
        setPhase("reviewing");
        return;
      }
      setPhase("confirming");
    },
    onError: (streamError) => {
      setError(streamError.message);
      setPhase("confirming");
    },
  });
  const report = reportFromLiveSpec(staticSpec) ?? reportFromLiveSpec(ui.spec);
  const offline = precomputedReport !== null;
  const agentText = latestAgentText(agent.data.messages);
  const generatedLens = latestToolSpec(agent.data.messages);
  const fallbackLens = useMemo(
    () => (report ? buildFallbackSpec(report, lensMode) : null),
    [lensMode, report],
  );
  const working = phase === "extracting" || phase === "reviewing" || ui.isStreaming || agentBusy;
  const confirmationBlocker = packetConfirmationBlocker(draft, ambiguities.length, working, locale);
  const split = phase !== "empty";
  const actions = quickActions(t);
  const workspaceTitle = phase === "extracting"
    ? t("workspace.title.extracting")
    : phase === "clarifying"
      ? t("workspace.title.clarifying")
      : phase === "confirming"
        ? t("workspace.title.confirming")
        : phase === "reviewing"
          ? t("workspace.title.reviewing")
          : t("workspace.title.complete");

  function updateDraft(nextDraft: ReviewCaseDraft): void {
    setDraft(nextDraft);
    setEditingPacket(false);
  }

  function focusPacketEditor(): void {
    const field = ambiguities[0]?.field.toLowerCase() ?? "";
    const targetId = field.includes("allerg")
      ? "packet-allergies"
      : field.includes("diagnos")
        ? "packet-diagnoses"
        : field.includes("med")
          ? "packet-medication-1"
          : "packet-editor";
    setMobilePane("canvas");
    setEditingPacket(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId) ?? document.getElementById("packet-editor");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  }

  function focusAmbiguityQuestion(): void {
    setMobilePane("eve");
    setHighlightClarification(true);
    window.setTimeout(() => setHighlightClarification(false), 1400);
    requestAnimationFrame(() => {
      const target = document.getElementById("active-clarification");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }

  function focusPacketConfirmation(): void {
    setMobilePane("canvas");
    requestAnimationFrame(() => {
      const target = document.getElementById("confirm-packet");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }

  async function askEve(ambiguity: IntakeAmbiguity, reviewCase: ReviewCaseInput): Promise<void> {
    await agent.send({
      message: `Ask the clinician the next source-grounded intake clarification. Ask exactly one concise question. ${languageInstruction(locale)}`,
      clientContext: {
        workflow: "intake",
        locale,
        intakePacket: JSON.parse(JSON.stringify({ case: reviewCase, ambiguities: [ambiguity] })),
      },
    });
  }

  async function extractSource(options?: { sourceFile?: File | null; sourceText?: string; confirmed?: boolean }): Promise<void> {
    const sourceFile = options?.sourceFile ?? file;
    const sourceText = options?.sourceText ?? input;
    const confirmed = options?.confirmed ?? deidentified;
    if (!confirmed) return;
    setError(null);
    setEditingPacket(false);
    setPhase("extracting");
    setMobilePane("canvas");
    setSourceName(sourceFile?.name ?? t("workspace.pastedNote"));
    try {
      const data = new FormData();
      data.append("text", sourceText);
      data.append("locale", locale);
      if (sourceFile) data.append("file", sourceFile);
      const response = await fetch("/api/intake", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error((result as { error?: string }).error ?? t("error.intake"));
      const extracted = intakeExtractionSchema.parse(result);
      setDraft(draftFromCase(extracted.case));
      setAmbiguities(extracted.ambiguities);
      setInput("");
      const next = extracted.ambiguities[0];
      setPhase(next ? "clarifying" : "confirming");
      setMobilePane(next ? "eve" : "canvas");
      if (next) await askEve(next, extracted.case);
    } catch (extractionError) {
      setError(extractionError instanceof Error ? extractionError.message : t("error.intake"));
      setPhase("empty");
    }
  }

  async function loadPublishedCase(item: PublishedCase): Promise<void> {
    setGalleryOpen(false);
    setEditingPacket(false);
    setDeidentified(true);
    setInput("");
    setError(null);
    setFile(null);
    agent.reset();
    ui.clear();
    setStaticSpec(null);

    // Published cases are precomputed and served as static, audited artifacts:
    // the review is deterministic and needs no runtime model call or API key.
    const precomputed = await loadPrecomputedReview(item.id, locale);
    if (precomputed?.intake) {
      setPhase("extracting");
      setSourceName(`${item.id}.pdf`);
      await delay(320);
      setDraft(draftFromCase(precomputed.intake.case));
      setAmbiguities(precomputed.intake.ambiguities);
      setPrecomputedReport(precomputed.report);
      const next = precomputed.intake.ambiguities[0];
      setPhase(next ? "clarifying" : "confirming");
      setMobilePane(next ? "eve" : "canvas");
      // The clarification text is already in the precomputed intake; the panel
      // renders it directly, so no live Eve turn is needed offline.
      return;
    }

    // Fallback to the live extraction path if a precomputed artifact is absent.
    try {
      const response = await fetch(item.pdf_url);
      if (!response.ok) throw new Error(t("error.publishedPdf"));
      const caseFile = new File([await response.blob()], `${item.id}.pdf`, { type: "application/pdf" });
      setFile(caseFile);
      await extractSource({ sourceFile: caseFile, sourceText: "", confirmed: true });
    } catch (publishedCaseError) {
      setError(publishedCaseError instanceof Error ? publishedCaseError.message : t("error.publishedCase"));
      setPhase("empty");
    }
  }

  async function loadDemo(): Promise<void> {
    agent.reset();
    ui.clear();
    setStaticSpec(null);
    const reviewCase = goldenCase;
    const ambiguity = demoAmbiguity(locale);
    setDraft(draftFromCase(reviewCase));
    setAmbiguities([ambiguity]);
    setAnswers([]);
    setInput("");
    setFile(null);
    setSourceName("synthetic-discharge-case.json");
    setDeidentified(true);
    setError(null);
    setLensRequested(false);
    setMobilePane("eve");
    setGalleryOpen(false);
    setEditingPacket(false);
    const precomputed = await loadPrecomputedReview("golden", locale);
    setPrecomputedReport(precomputed?.report ?? null);
    setPhase("clarifying");
    // Offline demo renders the seeded clarification directly; only the live
    // fallback (no precomputed golden for this locale) asks Eve to phrase it.
    if (!precomputed) await askEve(ambiguity, reviewCase);
  }

  async function submitComposer(answerOverride?: string, options?: { omitFromClinicalContext?: boolean }): Promise<void> {
    if (phase === "empty") {
      await extractSource();
      return;
    }
    if (phase === "clarifying" || phase === "confirming") {
      const answer = answerOverride?.trim() ?? input.trim();
      if (!answer) return;
      const current = ambiguities[0];
      const noteAddition = current
        ? `${t("workspace.clinicianClarification")}: ${current.question} ${t("workspace.answer")}: ${answer}`
        : `${t("workspace.additionalContext")}: ${answer}`;
      const nextDraft = options?.omitFromClinicalContext
        ? draft
        : { ...draft, note: [draft.note.trim(), noteAddition].filter(Boolean).join("\n\n") };
      const remaining = current ? ambiguities.slice(1) : ambiguities;
      setDraft(nextDraft);
      if (current) setAnswers((items) => [...items, { question: current.question, answer }]);
      setAmbiguities(remaining);
      setInput("");
      const next = remaining[0];
      if (next) {
        setPhase("clarifying");
        // Offline showcase reviews render the next precomputed clarification
        // directly; only the live path asks Eve to phrase it.
        if (!offline) await askEve(next, serializeReviewCase(nextDraft));
      } else {
        setEditingPacket(false);
        setPhase("confirming");
        setMobilePane("canvas");
      }
      return;
    }
    if (phase === "complete" && report) {
      const prompt = input.trim();
      if (!prompt) return;
      setLensRequested(true);
      setInput("");
      // Offline showcase reviews cannot run a live agent turn; the deterministic
      // fallback lens already covers packet exploration without a runtime key.
      if (offline) return;
      await agent.send({ message: prompt, clientContext: { locale, verifiedReportIndex: reportIndex(report) } });
    }
  }

  async function confirmPacket(): Promise<void> {
    setError(null);
    setLensRequested(false);

    // Showcase cases render their precomputed, audited report offline. The
    // stages animate locally so the demo keeps the live feel without a runtime
    // model call, then the verified packet is revealed deterministically.
    if (precomputedReport) {
      setPhase("reviewing");
      setMobilePane("canvas");
      for (const stage of ["ingest", "retrieve", "synthesize", "verify"] as const) {
        setStaticSpec(buildRunningReviewSpec(stage, locale));
        await delay(420);
      }
      setStaticSpec(buildCompletedReviewSpec(precomputedReport, locale));
      setPhase("complete");
      return;
    }

    try {
      const reviewCase = serializeReviewCase(draft);
      setPhase("reviewing");
      setMobilePane("canvas");
      await ui.send("Run the verified medication-safety pipeline and stream each artifact as it becomes available.", {
        case: reviewCase,
        syntheticOrDeidentified: true,
        locale,
      });
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t("error.reviewStart"));
      setPhase("confirming");
    }
  }

  async function requestLens(action: (typeof actions)[number]): Promise<void> {
    if (!report || agentBusy) return;
    setLensMode(action.mode);
    setLensRequested(true);
    // Offline showcase reviews use the deterministic fallback lens (built from
    // the verified report) instead of a live agent call, so no runtime key is
    // needed to explore the packet.
    if (offline) return;
    await agent.send({
      message: action.prompt,
      clientContext: { locale, verifiedReportIndex: reportIndex(report) },
    });
  }

  function reset(): void {
    agent.reset();
    ui.clear();
    setStaticSpec(null);
    setPrecomputedReport(null);
    setPhase("empty");
    setDraft(emptyReviewCase());
    setInput("");
    setFile(null);
    setSourceName(t("workspace.clinicalSource"));
    setDeidentified(false);
    setAmbiguities([]);
    setAnswers([]);
    setError(null);
    setLensRequested(false);
    setMobilePane("eve");
    setGalleryOpen(false);
    setEditingPacket(false);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <header className="shrink-0 border-b border-hairline bg-paper-raised">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <span className="shrink-0 font-serif-display text-[27px] leading-none tracking-[-0.02em]">Sourced</span>
            <span className="hidden h-7 w-px bg-hairline-strong sm:block" aria-hidden="true" />
            <span className="hidden text-[13px] font-medium text-ink-muted sm:block">{t("app.subtitle")}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex h-9 items-center rounded-md border border-hairline-strong bg-paper px-2.5 text-[12px] font-semibold text-ink-muted focus-within:border-info focus-within:ring-2 focus-within:ring-info-border">
              <span className="sr-only">{t("language.label")}</span>
              <select
                data-testid="language-switch"
                aria-label={t("language.label")}
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                className="bg-transparent outline-none"
              >
                <option value="en">{t("language.english")}</option>
                <option value="es">{t("language.spanish")}</option>
              </select>
            </label>
            {split ? (
              <button
                type="button"
                onClick={reset}
                aria-label={t("app.newReview")}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-paper px-3 text-[12px] font-semibold hover:border-info hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                <ArrowCounterClockwise className="h-4 w-4" weight="regular" />
                <span className="hidden sm:inline">{t("app.newReview")}</span>
              </button>
            ) : null}
            <span
              aria-label={phase === "complete" ? t("app.verified") : t("app.sourceBound")}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-verified"
            >
              <CheckCircle className="h-4 w-4" weight="regular" />
              <span className="hidden sm:inline">{phase === "complete" ? t("app.verified") : t("app.sourceBound")}</span>
            </span>
          </div>
        </div>
      </header>

      {!split ? (
        <main className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 py-8 sm:justify-center sm:overflow-visible sm:px-8 sm:pb-[10vh] sm:pt-10">
          <div className="w-full max-w-2xl">
            <div className="mb-8 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-info">{t("intake.eyebrow")}</p>
              <h1 className="mt-3 font-serif-display text-[38px] leading-tight tracking-[-0.02em] sm:text-[46px]">
                {t("intake.title")}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-ink-muted">
                {t("intake.description")}
              </p>
            </div>
            <MultimodalComposer
              value={input}
              onChange={setInput}
              file={file}
              onFile={setFile}
              onSubmit={() => void submitComposer()}
              busy={working}
              deidentified={deidentified}
              onDeidentifiedChange={setDeidentified}
              submitLabel={t("intake.extract")}
              busyLabel={t("intake.extracting")}
              disabledReason={!deidentified
                ? t("intake.privacyRequired")
                : input.trim() || file
                  ? undefined
                  : t("intake.sourceRequired")}
              placeholder={t("intake.placeholder")}
            />
            {error ? <p className="mt-3 text-center text-[12px] text-major" role="alert">{error}</p> : null}
          </div>
          <div className="mt-4 flex w-full max-w-2xl flex-col items-stretch gap-2 sm:fixed sm:bottom-6 sm:right-6 sm:mt-0 sm:w-auto sm:flex-row sm:items-end">
            <button
              type="button"
              data-testid="published-cases-trigger"
              onClick={() => setGalleryOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-paper-raised px-4 py-3 text-[12px] font-semibold text-ink shadow-sm hover:border-info hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              <BookOpenText className="h-4 w-4 text-info" weight="regular" />
              {t("intake.publishedCases")}
              <span className="text-[9px] font-medium uppercase tracking-wide text-ink-faint">{t("intake.pdfCount", { count: publishedCases.length })}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadDemo()}
              className="inline-flex items-center gap-2 rounded-lg border border-info-border bg-paper-raised px-4 py-3 text-[12px] font-semibold text-info shadow-sm hover:border-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              <Sparkle className="h-4 w-4" weight="duotone" />
              {t("intake.trySynthetic")}
              <span className="text-[9px] font-medium uppercase tracking-wide text-ink-faint">{t("intake.demoOnly")}</span>
            </button>
          </div>
        </main>
      ) : (
        <main className="flex h-[calc(100dvh-65px)] min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(420px,0.84fr)_minmax(0,1.16fr)]">
          <div className="grid shrink-0 grid-cols-2 border-b border-hairline bg-paper lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePane("eve")}
              className={`px-4 py-3 text-[11px] font-semibold ${mobilePane === "eve" ? "border-b-2 border-info text-info" : "text-ink-muted"}`}
            >
              {t("workspace.reviewTab")}
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("canvas")}
              className={`px-4 py-3 text-[11px] font-semibold ${mobilePane === "canvas" ? "border-b-2 border-info text-info" : "text-ink-muted"}`}
            >
              {t("workspace.canvasTab")}
            </button>
          </div>
          <section className={`${mobilePane === "eve" ? "flex" : "hidden"} min-h-0 flex-1 flex-col border-b border-hairline bg-paper-raised lg:flex lg:border-b-0 lg:border-r`}>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-info-border bg-info-bg font-serif-display text-[15px] text-info">S</span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">{t("workspace.assistant")}</p>
                  <p className="text-[10.5px] text-ink-faint">{t("workspace.orchestrator")}</p>
                </div>
              </div>

              <div className="mt-7">
                <h1 className="font-serif-display text-[27px] leading-tight">{workspaceTitle}</h1>
                {phase === "clarifying" ? (
                  <div
                    id="active-clarification"
                    tabIndex={-1}
                    data-ambiguity-id={ambiguities[0]?.id}
                    data-ambiguity-question={ambiguities[0]?.question}
                    className={`mt-4 flex min-h-[250px] gap-3 rounded-lg border border-info-border bg-info-bg/35 px-4 py-4 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-info sm:min-h-[190px] ${highlightClarification ? "ring-2 ring-info ring-offset-2 ring-offset-paper" : ""}`}
                    aria-live="polite"
                    aria-busy={agentBusy}
                  >
                    {agentBusy ? (
                      <CircleNotch className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-info motion-reduce:animate-none" weight="bold" />
                    ) : (
                      <Question className="mt-0.5 h-5 w-5 shrink-0 text-info" weight="regular" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-info">
                        {agentBusy
                          ? t("workspace.ambiguityAnalyzing")
                          : t("workspace.actionRequired", {
                              current: answers.length + 1,
                              total: answers.length + ambiguities.length,
                            })}
                      </p>
                      {agentBusy ? (
                        <div className="mt-3" role="status">
                          <p className="font-serif-display text-[16px] leading-snug text-ink">{t("workspace.preparingQuestion")}</p>
                          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                            {t("workspace.checkingQuestion")}
                          </p>
                          <div className="mt-4 space-y-2" aria-hidden="true">
                            <span className="block h-2 w-full animate-pulse rounded bg-info-border/70 motion-reduce:animate-none" />
                            <span className="block h-2 w-3/4 animate-pulse rounded bg-info-border/45 motion-reduce:animate-none" />
                          </div>
                        </div>
                      ) : (
                        <div className="question-reveal mt-3">
                          <p className="font-serif-display text-[16px] leading-snug text-ink">
                            {agentText ?? ambiguities[0]?.question}
                          </p>
                          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                            {t("workspace.questionHelp")}
                          </p>
                          <button
                            type="button"
                            data-testid="edit-structured-packet"
                            onClick={focusPacketEditor}
                            className="mt-3 rounded text-[11px] font-semibold text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                          >
                            {t("workspace.editMedications")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    {agentBusy
                      ? t("workspace.busyDescription")
                      : phase === "confirming"
                        ? t("workspace.confirmingDescription")
                        : phase === "complete"
                          ? t("workspace.completeDescription")
                          : phase === "extracting"
                            ? t("workspace.extractingDescription")
                            : t("workspace.reviewingDescription")}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center gap-3 border-y border-hairline py-3">
                <FilePdf className="h-5 w-5 shrink-0 text-major" weight="regular" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">{sourceName}</p>
                  <p className="text-[10px] text-ink-faint">{t("workspace.importedSource")}</p>
                </div>
                <CheckCircle className="h-4 w-4 shrink-0 text-verified" weight="regular" />
              </div>

              {answers.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {answers.map((item, index) => (
                    <div key={`${item.question}-${index}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{t("workspace.clarificationRequested")}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{item.question}</p>
                      <p className="mt-2 border-l-2 border-info-border pl-3 text-[12.5px] leading-relaxed text-ink">{item.answer}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-hairline px-5 py-4 sm:px-7">
              {phase === "clarifying" ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ambiguity = ambiguities[0];
                        if (ambiguity) void askEve(ambiguity, serializeReviewCase(draft));
                      }}
                      disabled={!ambiguities[0] || agentBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11px] font-semibold hover:border-info hover:text-info disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Copy className="h-3.5 w-3.5" weight="regular" /> {t("workspace.askAgain")}
                    </button>
                    <button
                      type="button"
                      data-testid="keep-unknown"
                      onClick={() => void submitComposer(t("workspace.keepUnknownAnswer"), { omitFromClinicalContext: true })}
                      disabled={working}
                      className="rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11px] font-semibold hover:border-info hover:text-info disabled:cursor-wait disabled:opacity-50"
                    >
                      {t("workspace.keepUnknown")}
                    </button>
                  </div>
                  <MultimodalComposer
                    value={input}
                    onChange={setInput}
                    file={file}
                    onFile={setFile}
                    onSubmit={() => void submitComposer()}
                    busy={working}
                    deidentified={deidentified}
                    onDeidentifiedChange={setDeidentified}
                    compact
                    attachmentLocked
                    requireText
                    submitLabel={t("workspace.saveAnswer")}
                    busyLabel={t("workspace.preparingQuestionShort")}
                    placeholder={t("workspace.answerPlaceholder")}
                    disabledReason={working ? t("workspace.waitQuestion") : input.trim() ? undefined : t("workspace.answerRequired")}
                  />
                </>
              ) : phase === "confirming" ? (
                <div className="rounded-lg border border-verified-border bg-verified-bg px-4 py-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-verified" weight="fill" />
                    <div>
                      <p className="text-[12px] font-semibold text-ink">{t("workspace.questionsResolved")}</p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">{t("workspace.questionsResolvedHelp")}</p>
                      <button type="button" onClick={focusPacketConfirmation} className="mt-2 text-[11px] font-semibold text-info hover:underline">
                        {t("workspace.goToPacket")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : phase === "complete" ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setLensRequested(false)}
                      className={`rounded-md px-3 py-2 text-[11px] font-semibold ${!lensRequested ? "bg-ink text-white" : "border border-hairline-strong bg-paper hover:border-info hover:text-info"}`}
                    >
                      {t("workspace.liveReview")}
                    </button>
                    {actions.map((action) => (
                      <button
                        key={action.mode}
                        type="button"
                        onClick={() => void requestLens(action)}
                        disabled={agentBusy}
                        className="rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11px] font-semibold hover:border-info hover:text-info disabled:cursor-wait disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                  <MultimodalComposer
                    value={input}
                    onChange={setInput}
                    file={file}
                    onFile={setFile}
                    onSubmit={() => void submitComposer()}
                    busy={working}
                    deidentified={deidentified}
                    onDeidentifiedChange={setDeidentified}
                    compact
                    attachmentLocked
                    requireText
                    submitLabel={t("workspace.updateView")}
                    busyLabel={t("workspace.arrangingView")}
                    placeholder={t("workspace.viewPlaceholder")}
                    disabledReason={input.trim() ? undefined : t("workspace.viewRequired")}
                  />
                </>
              ) : (
                <div className="flex items-start gap-3 rounded-lg border border-info-border bg-info-bg px-4 py-3" role="status" aria-live="polite">
                  <CircleNotch className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-info motion-reduce:animate-none" weight="bold" />
                  <div>
                    <p className="text-[12px] font-semibold text-ink">{phase === "extracting" ? t("workspace.extractingPdf") : t("workspace.runningReview")}</p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">{phase === "extracting" ? t("workspace.extractingPdfHelp") : t("workspace.runningReviewHelp")}</p>
                  </div>
                </div>
              )}
              {error ? <p className="mt-2 text-[11px] text-major" role="alert">{error}</p> : null}
            </div>
          </section>

          <section className={`${mobilePane === "canvas" ? "block" : "hidden"} min-h-0 min-w-0 flex-1 overflow-y-auto bg-paper px-5 py-5 sm:px-8 sm:py-6 lg:block`}>
            <div className="mx-auto w-full max-w-5xl">
              <WorkspaceStageRail phase={phase} />
              <div className="pt-6">
                {phase === "extracting" ? (
                  <SourceExtractionStatus sourceName={sourceName} />
                ) : phase === "clarifying" || phase === "confirming" ? (
                  <PatientPacketEditor
                    draft={draft}
                    onChange={updateDraft}
                    ambiguities={ambiguities}
                    sourceName={sourceName}
                    editingHint={editingPacket}
                    onConfirm={() => void confirmPacket()}
                    confirmDisabled={confirmationBlocker !== null}
                    confirmDisabledReason={confirmationBlocker ?? undefined}
                    onAmbiguityClick={focusAmbiguityQuestion}
                  />
                ) : lensRequested && report ? (
                  generatedLens || !agentBusy ? (
                    <SafeReviewLens report={report} spec={generatedLens ?? fallbackLens} />
                  ) : (
                    <div className="flex min-h-80 items-center justify-center text-center">
                      <div>
                        <Sparkle className="mx-auto h-5 w-5 animate-pulse text-info" weight="duotone" />
                        <p className="mt-3 font-serif-display text-[20px]">{t("workspace.arrangingArtifacts")}</p>
                        <p className="mt-1 text-[12px] text-ink-muted">{t("workspace.noClinicalCopy")}</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div data-testid={phase === "complete" ? "verified-review" : "review-canvas"}>
                    <LiveReviewCanvas spec={(staticSpec ?? ui.spec) as Spec | null} streaming={ui.isStreaming || (phase === "reviewing" && offline)} />
                    {phase === "complete" && report?.research_candidates?.length ? (
                      <div className="mt-5">
                        <ResearchQueue
                          candidates={report.research_candidates}
                          totalKnownUnknown={report.research_total_known_unknown}
                          patientSummary={report.patient_summary}
                        />
                      </div>
                    ) : null}
                    {phase === "reviewing" && error ? (
                      <button
                        type="button"
                        onClick={() => void confirmPacket()}
                        className="mt-4 rounded-md bg-info px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#173f70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                      >
                        {t("workspace.retryReview")}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      )}
      <PublishedCaseGallery
        cases={publishedCases}
        open={galleryOpen}
        busy={working}
        onClose={() => setGalleryOpen(false)}
        onLoad={(item) => void loadPublishedCase(item)}
      />
    </div>
  );
}
