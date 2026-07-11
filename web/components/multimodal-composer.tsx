"use client";

import {
  ArrowRight,
  CheckCircle,
  FilePdf,
  Microphone,
  Paperclip,
  StopCircle,
  X,
} from "@phosphor-icons/react";
import { useId, useRef } from "react";
import { useTranscribe } from "@/hooks/use-transcribe";
import { useI18n } from "@/lib/i18n";
import { canSubmitComposer } from "@/lib/workspace-ux";

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MultimodalComposer({
  value,
  onChange,
  file,
  onFile,
  onSubmit,
  busy,
  disabled,
  deidentified,
  onDeidentifiedChange,
  compact = false,
  attachmentLocked = false,
  placeholder,
  requireText = false,
  submitLabel = "Continue",
  busyLabel = "Processing…",
  disabledReason,
}: {
  value: string;
  onChange: (value: string) => void;
  file: File | null;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled?: boolean;
  deidentified: boolean;
  onDeidentifiedChange: (value: boolean) => void;
  compact?: boolean;
  attachmentLocked?: boolean;
  placeholder: string;
  requireText?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  disabledReason?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const transcribe = useTranscribe((transcript) => {
    onChange([value.trim(), transcript].filter(Boolean).join(" "));
  });
  const hasText = value.trim().length > 0;
  const canSubmit = canSubmitComposer({
    busy,
    disabled: Boolean(disabled),
    deidentified,
    hasText,
    hasFile: file !== null,
    attachmentLocked,
    requireText,
  });

  return (
    <div className={`border border-hairline-strong bg-paper-raised ${compact ? "rounded-lg" : "rounded-xl"}`}>
      <textarea
        data-testid="composer-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={busy || disabled}
        rows={compact ? 2 : 6}
        className="block w-full resize-none bg-transparent px-4 pt-4 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:cursor-wait sm:px-5"
      />

      {file ? (
        <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-md border border-hairline bg-paper px-3 py-2 sm:mx-5">
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
            <FilePdf className="h-4 w-4 shrink-0 text-major" weight="regular" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-ink-faint">{Math.max(1, Math.round(file.size / 1024))} KB</span>
          </span>
          {attachmentLocked ? (
            <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">{t("composer.sourceLocked")}</span>
          ) : (
            <button
              type="button"
              onClick={() => onFile(null)}
              aria-label={t("composer.removeAttachment")}
              className="rounded p-1 text-ink-faint hover:bg-paper-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              <X className="h-4 w-4" weight="regular" />
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pb-4">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,text/plain,.pdf,.txt"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled || attachmentLocked}
            className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium text-ink-muted hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" weight="regular" />
            {attachmentLocked ? t("composer.sourceAttached") : t("composer.attachPdf")}
          </button>
          <button
            type="button"
            onClick={() => (transcribe.isRecording ? transcribe.stop() : void transcribe.start())}
            disabled={busy || disabled || transcribe.isTranscribing}
            aria-pressed={transcribe.isRecording}
            className={`inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:opacity-50 ${
              transcribe.isRecording ? "bg-major-bg text-major" : "text-ink-muted hover:bg-paper hover:text-ink"
            }`}
          >
            {transcribe.isRecording ? (
              <StopCircle className="h-4 w-4" weight="fill" />
            ) : (
              <Microphone className="h-4 w-4" weight="regular" />
            )}
            {transcribe.isRecording
              ? formatSeconds(transcribe.seconds)
              : transcribe.isTranscribing
                ? t("composer.transcribing")
                : t("composer.dictate")}
          </button>
        </div>
        <button
          type="button"
          data-testid="composer-continue"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-describedby={disabledReason ? hintId : undefined}
          className="inline-flex items-center gap-2 rounded-md bg-info px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#173f70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
        >
          {busy ? busyLabel : submitLabel}
          <ArrowRight className="h-4 w-4" weight="bold" />
        </button>
      </div>

      {disabledReason ? (
        <p id={hintId} className="px-4 pb-3 text-[10.5px] leading-relaxed text-ink-faint sm:px-5" aria-live="polite">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-hairline bg-info-bg/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {attachmentLocked ? (
          <span className="inline-flex items-center gap-2 text-[11px] font-medium text-verified">
            <CheckCircle className="h-4 w-4 shrink-0" weight="fill" />
            {t("composer.deidentifiedConfirmed")}
          </span>
        ) : (
          <label className="flex items-start gap-2.5 text-[12px] font-medium leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              checked={deidentified}
              onChange={(event) => onDeidentifiedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-info"
            />
            {t("composer.privacy")}
          </label>
        )}
        <span className="shrink-0 text-[10px] text-ink-faint" aria-live="polite">
          {transcribe.error ?? (transcribe.isTranscribing ? t("composer.transcriptPending") : t("composer.voiceHelp"))}
        </span>
      </div>
    </div>
  );
}
