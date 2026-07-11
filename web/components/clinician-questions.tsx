"use client";

import { useI18n } from "@/lib/i18n";

export function ClinicianQuestions({ questions }: { questions: string[] }) {
  const { t } = useI18n();
  if (questions.length === 0) return null;

  return (
    <section aria-labelledby="clinician-questions-heading">
      <h2
        id="clinician-questions-heading"
        className="mb-4 font-serif-display text-[21px] text-ink"
      >
        {t("questions.title")}
      </h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {questions.map((question, i) => (
          <li
            key={question}
            className="flex gap-3 rounded-xl border border-hairline bg-paper-raised px-4 py-4"
          >
            <span
              className="shrink-0 font-mono-source text-[12px] text-ink-faint mt-0.5"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-[14px] leading-relaxed text-ink">{question}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
