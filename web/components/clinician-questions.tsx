export function ClinicianQuestions({ questions }: { questions: string[] }) {
  if (questions.length === 0) return null;

  return (
    <section aria-labelledby="clinician-questions-heading">
      <h2
        id="clinician-questions-heading"
        className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-3"
      >
        Questions for the clinician
      </h2>
      <ol className="flex flex-col gap-2.5">
        {questions.map((question, i) => (
          <li
            key={question}
            className="flex gap-3 rounded-xl border border-hairline bg-paper-raised px-4 py-3.5"
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
