"use client";

import type { ReviewCaseDraft, ReviewLabDraft } from "@/lib/review-case";
import { ReviewProgress, type ReviewProgressEvent } from "@/components/review-progress";

interface ReviewIntakeProps {
  draft: ReviewCaseDraft;
  onChange: (draft: ReviewCaseDraft) => void;
  onLoadGolden: () => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  syntheticConfirmed: boolean;
  onSyntheticConfirmed: (confirmed: boolean) => void;
  progress: ReviewProgressEvent[];
  error: string | null;
}

const fieldClass =
  "w-full rounded-md border border-hairline-strong bg-paper-raised px-3 py-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-info focus:ring-2 focus:ring-info-border disabled:cursor-wait disabled:bg-paper";

function updateLab(labs: ReviewLabDraft[], index: number, patch: Partial<ReviewLabDraft>): ReviewLabDraft[] {
  return labs.map((lab, labIndex) => (labIndex === index ? { ...lab, ...patch } : lab));
}

export function ReviewIntake(props: ReviewIntakeProps) {
  const { draft } = props;
  return (
    <section aria-labelledby="new-review-heading" className="border-b border-hairline bg-paper">
      <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="overflow-hidden rounded-xl border border-hairline bg-paper-raised shadow-[0_18px_55px_rgba(20,24,28,0.06)]">
          <header className="flex flex-col gap-4 border-b border-hairline px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="max-w-2xl">
              <h1 id="new-review-heading" className="font-serif-display text-[25px] text-ink">
                New medication review
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                Enter the patient context exactly as received. Sourced resolves medications, retrieves cited evidence, synthesizes, and verifies before anything is published.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onLoadGolden}
              disabled={props.running}
              className="shrink-0 rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[11.5px] font-semibold text-ink hover:border-info hover:text-info disabled:cursor-wait disabled:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
            >
              Load synthetic golden case
            </button>
          </header>

          <div className="grid lg:grid-cols-2">
            <div className="border-b border-hairline px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
              <label className="block">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Clinical note</span>
                <textarea
                  value={draft.note}
                  onChange={(event) => props.onChange({ ...draft, note: event.target.value })}
                  disabled={props.running}
                  rows={7}
                  placeholder="Paste a synthetic or de-identified discharge note…"
                  className={`${fieldClass} mt-2 resize-y leading-relaxed`}
                />
              </label>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Diagnoses</span>
                  <textarea
                    value={draft.diagnoses}
                    onChange={(event) => props.onChange({ ...draft, diagnoses: event.target.value })}
                    disabled={props.running}
                    rows={5}
                    placeholder="One diagnosis per line"
                    className={`${fieldClass} mt-2 resize-y`}
                  />
                </label>
                <label className="block">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Allergies</span>
                  <textarea
                    value={draft.allergies}
                    onChange={(event) => props.onChange({ ...draft, allergies: event.target.value })}
                    disabled={props.running}
                    rows={5}
                    placeholder="One allergy per line"
                    className={`${fieldClass} mt-2 resize-y`}
                  />
                </label>
              </div>
            </div>

            <div className="px-5 py-5 lg:px-6">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Medications</p>
                <button
                  type="button"
                  disabled={props.running}
                  onClick={() => props.onChange({ ...draft, medications: [...draft.medications, ""] })}
                  className="text-[11.5px] font-semibold text-info hover:underline disabled:text-ink-faint"
                >
                  Add medication
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {draft.medications.map((medication, index) => (
                  <div key={`medication-${index}`} className="flex gap-2">
                    <label className="sr-only" htmlFor={`medication-${index}`}>
                      Medication {index + 1}
                    </label>
                    <input
                      id={`medication-${index}`}
                      value={medication}
                      onChange={(event) => {
                        const medications = [...draft.medications];
                        medications[index] = event.target.value;
                        props.onChange({ ...draft, medications });
                      }}
                      disabled={props.running}
                      placeholder="amiodarona 200mg"
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      disabled={props.running || draft.medications.length === 1}
                      onClick={() => props.onChange({
                        ...draft,
                        medications: draft.medications.filter((_, medicationIndex) => medicationIndex !== index),
                      })}
                      className="rounded-md border border-hairline px-3 text-[11px] font-semibold text-ink-faint hover:border-major-border hover:text-major disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Key labs</p>
                <button
                  type="button"
                  disabled={props.running}
                  onClick={() => props.onChange({
                    ...draft,
                    labs: [...draft.labs, { name: "", value: "", unit: "", refLow: "", refHigh: "" }],
                  })}
                  className="text-[11.5px] font-semibold text-info hover:underline disabled:text-ink-faint"
                >
                  Add lab
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {draft.labs.map((lab, index) => (
                  <div key={`lab-${index}`} className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_0.7fr_auto] gap-2">
                    <input aria-label={`Lab ${index + 1} name`} value={lab.name} onChange={(event) => props.onChange({ ...draft, labs: updateLab(draft.labs, index, { name: event.target.value }) })} disabled={props.running} placeholder="INR" className={fieldClass} />
                    <input aria-label={`Lab ${index + 1} value`} value={lab.value} onChange={(event) => props.onChange({ ...draft, labs: updateLab(draft.labs, index, { value: event.target.value }) })} disabled={props.running} inputMode="decimal" placeholder="2.6" className={fieldClass} />
                    <input aria-label={`Lab ${index + 1} unit`} value={lab.unit} onChange={(event) => props.onChange({ ...draft, labs: updateLab(draft.labs, index, { unit: event.target.value }) })} disabled={props.running} placeholder="unit" className={fieldClass} />
                    <input aria-label={`Lab ${index + 1} lower reference`} value={lab.refLow} onChange={(event) => props.onChange({ ...draft, labs: updateLab(draft.labs, index, { refLow: event.target.value }) })} disabled={props.running} inputMode="decimal" placeholder="low" className={fieldClass} />
                    <input aria-label={`Lab ${index + 1} upper reference`} value={lab.refHigh} onChange={(event) => props.onChange({ ...draft, labs: updateLab(draft.labs, index, { refHigh: event.target.value }) })} disabled={props.running} inputMode="decimal" placeholder="high" className={fieldClass} />
                    <button
                      type="button"
                      aria-label={`Remove lab ${index + 1}`}
                      disabled={props.running || draft.labs.length === 1}
                      onClick={() => props.onChange({ ...draft, labs: draft.labs.filter((_, labIndex) => labIndex !== index) })}
                      className="rounded-md border border-hairline px-2 text-[11px] font-semibold text-ink-faint hover:border-major-border hover:text-major disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <footer className="flex flex-col gap-4 border-t border-hairline bg-paper px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="flex max-w-2xl cursor-pointer items-start gap-3 text-[11.5px] leading-relaxed text-ink-muted">
              <input
                type="checkbox"
                checked={props.syntheticConfirmed}
                onChange={(event) => props.onSyntheticConfirmed(event.target.checked)}
                disabled={props.running}
                className="mt-0.5 h-4 w-4 accent-[var(--color-info)]"
              />
              I confirm this case is synthetic or de-identified and contains no protected health information.
            </label>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <button type="button" onClick={props.onCancel} disabled={props.running} className="rounded-md px-3 py-2.5 text-[12px] font-semibold text-ink-muted hover:text-ink disabled:cursor-wait disabled:text-ink-faint">
                Cancel
              </button>
              <button
                type="button"
                onClick={props.onRun}
                disabled={props.running || !props.syntheticConfirmed}
                className="rounded-md bg-ink px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-info disabled:cursor-not-allowed disabled:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
              >
                {props.running ? "Running verified review…" : "Run verified review"}
              </button>
            </div>
          </footer>

          {props.error ? (
            <p className="border-t border-major-border bg-major-bg px-5 py-3 text-[12px] text-major sm:px-6" role="alert">
              {props.error}
            </p>
          ) : null}
          {props.running || props.progress.length > 0 ? <ReviewProgress events={props.progress} /> : null}
        </div>
      </div>
    </section>
  );
}
