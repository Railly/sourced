"use client";

import {
  Flask,
  IdentificationCard,
  PencilSimple,
  Pill,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { IntakeAmbiguity } from "@/lib/intake";
import {
  activeMedicationDraft,
  type ReviewCaseDraft,
  type ReviewMedicationDraft,
} from "@/lib/review-case";
import type { MedicationStatus } from "@/lib/types";
import { TagInput } from "@/components/tag-input";
import { useI18n } from "@/lib/i18n";
import { labUnitOptions } from "@/lib/workspace-ux";

const fieldClass =
  "w-full min-w-0 rounded border border-hairline bg-paper-raised px-2 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint hover:border-hairline-strong focus:border-info focus:ring-2 focus:ring-info-border";

// Dose, form, frequency and filler words that appear in medication labels but
// are NOT drug identities. Excluded from clarification-row matching so a dose
// phrase in a question ("40-25 mg daily") never lights up unrelated rows.
const MED_STOPWORDS = new Set([
  "daily", "twice", "once", "every", "hours", "night", "morning", "bedtime", "weekly", "prn",
  "tablet", "tablets", "capsule", "capsules", "syrup", "solution", "cream", "patch", "inhaler",
  "spray", "drops", "injection", "vial", "pack", "dose", "doses", "pill", "pills", "liquid",
  "daría", "diaria", "diario", "veces", "cada", "noche", "comprimido", "jarabe", "cápsula",
  "product", "combination", "combined", "ingredient", "ingredients", "producto", "combinado",
  "included", "prescribed", "extracted", "considered", "medication", "medications", "medicament",
  "along", "with", "included", "other", "using", "given",
]);

const medicationStatuses: MedicationStatus[] = [
  "active",
  "historical",
  "held",
  "stopped",
  "one-time",
  "indirect-exposure",
  "uncertain",
];


function updateMedicationDetails(
  draft: ReviewCaseDraft,
  index: number,
  patch: Partial<ReviewMedicationDraft>,
): ReviewMedicationDraft[] {
  const details = draft.medications.map(
    (_, medicationIndex) => draft.medicationDetails[medicationIndex] ?? activeMedicationDraft(),
  );
  details[index] = { ...details[index]!, ...patch };
  return details;
}

export function PatientPacketEditor({
  draft,
  onChange,
  ambiguities,
  sourceName,
  editingHint = false,
  onConfirm,
  confirmDisabled = false,
  confirmDisabledReason,
}: {
  draft: ReviewCaseDraft;
  onChange: (draft: ReviewCaseDraft) => void;
  ambiguities: IntakeAmbiguity[];
  sourceName: string;
  editingHint?: boolean;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
}) {
  const { t } = useI18n();
  // Only flag a genuine duplicate/same-drug clarification. The specific
  // medications are named precisely in the clarification question itself, so the
  // banner stays generic rather than guessing drug names from free text (which
  // is unsafe in a medication-safety tool).
  const duplicateWarning = ambiguities.find((item) =>
    /duplicate|duplicad|duplicidad|same.?drug|same medication|mismo medicamento|misma droga/i.test(item.question),
  );

  // Which packet sections an open clarification touches, so the affected zone is
  // called out (not just in the assistant pane). Derived from the ambiguity's
  // structured field first, falling back to the question text.
  const flagged = { medications: false, patient: false, labs: false };
  const medQuestions: string[] = [];
  for (const item of ambiguities) {
    const hay = `${item.field ?? ""} ${item.question}`.toLowerCase();
    if (/med|drug|dose|regimen|coumadin|warfar|tablet|farmac|medicament/.test(hay)) {
      flagged.medications = true;
      medQuestions.push(item.question.toLowerCase());
    }
    if (/diagnos|allerg|history|condition|patient|alergi|antecedent/.test(hay)) flagged.patient = true;
    if (/lab|creatinine|inr|potassium|sodium|value|creatinina|potasio|sodio/.test(hay)) flagged.labs = true;
  }

  // Highlight only the specific rows a clarification names, not the whole
  // section. A row is flagged when a DRUG-NAME word from its own label appears
  // in a medication clarification question. Dose, form and frequency words
  // ("daily", "mg", "dose", "syrup", "tablet"...) are excluded, otherwise a
  // question like "40-25 mg daily" would light up every "... mg daily" row.
  // Accents are stripped so "olmesartán" (question) matches "olmesartan" (row).
  const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const questionText = medQuestions.map(deburr);
  const medicationRowFlagged = (name: string): boolean => {
    if (questionText.length === 0) return false;
    const words = (deburr(name).match(/[a-z]{5,}/g) ?? []).filter((word) => !MED_STOPWORDS.has(word));
    return words.some((word) => questionText.some((question) => question.includes(word)));
  };
  const rowFlagClass =
    "-mx-2 rounded-md bg-moderate-bg px-2 ring-1 ring-inset ring-moderate-border";

  return (
    <div
      id="packet-editor"
      tabIndex={-1}
      className={`mx-auto w-full max-w-4xl rounded-lg outline-none transition-shadow ${editingHint ? "ring-2 ring-info-border ring-offset-4 ring-offset-paper" : ""}`}
    >
      <div className="border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif-display text-[24px] leading-tight text-ink">{t("packet.title")}</h1>
            <span className="rounded border border-hairline-strong bg-paper px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
              {t("packet.draft")}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {ambiguities.length > 0
              ? t("packet.sourceWithAmbiguity", { source: sourceName })
              : t("packet.sourceReady", { source: sourceName })}
          </p>
        </div>
      </div>

      {editingHint ? (
        <div className="mt-4 rounded-md border border-info-border bg-info-bg px-3 py-2.5 text-[11px] leading-relaxed text-info" role="status">
          {t("packet.editingHint")}
        </div>
      ) : null}

      <section className="border-b border-hairline py-5">
        <div className="mb-3 flex items-center gap-2">
          <IdentificationCard className={`h-4 w-4 ${flagged.patient ? "text-moderate" : "text-ink-muted"}`} weight="regular" />
          <h2 className="text-[12.5px] font-semibold text-ink">{t("packet.patientContext")}</h2>
          {flagged.patient ? (
            <span className="rounded-full border border-moderate-border bg-moderate-bg px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-moderate">
              {t("packet.needsReview")}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-ink-faint">
            <PencilSimple className="h-3 w-3" weight="regular" /> {t("packet.editable")}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="block">
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">{t("packet.diagnoses")}</span>
            <TagInput
              id="packet-diagnoses"
              value={draft.diagnoses}
              onChange={(next) => onChange({ ...draft, diagnoses: next })}
              placeholder={t("packet.noDiagnoses")}
              ariaLabel={t("packet.diagnoses")}
            />
            {!draft.diagnoses.trim() ? (
              <span className="mt-1 block text-[10px] leading-relaxed text-ink-faint">{t("packet.addPerLine")}</span>
            ) : null}
          </div>
          <div className="block">
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">{t("packet.allergies")}</span>
            <TagInput
              id="packet-allergies"
              value={draft.allergies}
              onChange={(next) => onChange({ ...draft, allergies: next })}
              placeholder={t("packet.noAllergies")}
              ariaLabel={t("packet.allergies")}
            />
            {!draft.allergies.trim() ? (
              <span className="mt-1 block text-[10px] leading-relaxed text-ink-faint">{t("packet.allergiesHelp")}</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-b border-hairline py-5">
        <div className="mb-3 flex items-center gap-2">
          <Pill className={`h-4 w-4 ${flagged.medications ? "text-moderate" : "text-ink-muted"}`} weight="regular" />
          <h2 className="text-[12.5px] font-semibold text-ink">{t("packet.medications")}</h2>
          <span className="rounded-full border border-hairline-strong bg-paper px-2 py-0.5 text-[9.5px] font-semibold text-ink-muted">
            {t("packet.extracted", { count: draft.medications.filter(Boolean).length })}
          </span>
          {flagged.medications ? (
            <span className="rounded-full border border-moderate-border bg-moderate-bg px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-moderate">
              {t("packet.needsReview")}
            </span>
          ) : null}
        </div>
        {duplicateWarning ? (
          <div
            id="shared-medication-ambiguity"
            className="mb-3 flex items-start gap-3 rounded-lg border border-moderate-border bg-moderate-bg px-4 py-3"
          >
            <WarningCircle className="mt-0.5 h-5 w-5 shrink-0 text-moderate" weight="regular" />
            <div>
              <p className="text-[11.5px] font-semibold text-ink">{t("packet.sharedAmbiguityTitle")}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-muted">
                {t("packet.sharedAmbiguityGeneric")}
              </p>
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-hairline border-y border-hairline">
          {draft.medications.length === 0 ? (
            <p className="py-4 text-[11px] text-ink-faint">{t("packet.noMedications")}</p>
          ) : null}
          {draft.medications.map((medication, index) => {
            const details = draft.medicationDetails[index] ?? activeMedicationDraft();
            const rowFlagged = medicationRowFlagged(medication);
            return (
              <div key={index} className={`py-2.5 ${rowFlagged ? rowFlagClass : ""}`}>
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:gap-3">
                  <span className="row-span-2 flex h-6 w-6 shrink-0 items-center justify-center sm:row-span-1">
                    <span className="h-2 w-2 rounded-full bg-ink-faint" aria-hidden="true" />
                  </span>
                  <input
                    data-testid="packet-medication"
                    id={`packet-medication-${index + 1}`}
                    value={medication}
                    aria-label={t("packet.medicationLabel", { index: index + 1 })}
                    placeholder={t("packet.medicationPlaceholder")}
                    onChange={(event) => {
                      const medications = [...draft.medications];
                      medications[index] = event.target.value;
                      onChange({ ...draft, medications });
                    }}
                    className={`${fieldClass} col-span-2 sm:col-span-1`}
                  />
                  <select
                    data-testid="packet-medication-status"
                    aria-label={t("packet.statusLabel", { index: index + 1 })}
                    value={details.status}
                    onChange={(event) => onChange({
                      ...draft,
                      medicationDetails: updateMedicationDetails(draft, index, {
                        status: event.target.value as MedicationStatus,
                      }),
                    })}
                    className="col-start-2 min-w-0 rounded border border-hairline-strong bg-paper px-2 py-1 text-[10.5px] font-medium text-ink-muted outline-none focus:border-info focus:ring-2 focus:ring-info-border sm:col-start-auto sm:shrink-0"
                  >
                    {medicationStatuses.map((status) => (
                      <option key={status} value={status}>{t(`status.${status}` as `status.${MedicationStatus}`)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t("packet.removeMedication", { index: index + 1 })}
                    onClick={() => onChange({
                      ...draft,
                      medications: draft.medications.filter((_, medicationIndex) => medicationIndex !== index),
                      medicationDetails: draft.medicationDetails.filter((_, medicationIndex) => medicationIndex !== index),
                    })}
                    className="rounded p-1.5 text-ink-faint hover:bg-paper hover:text-major focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                  >
                    <Trash className="h-3.5 w-3.5" weight="regular" />
                  </button>
                </div>
                {details.sourceSpan ? (
                  <p className="ml-8 mt-1 text-[10px] leading-relaxed text-ink-faint">
                    {t("packet.source", { source: details.sourceSpan })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onChange({
            ...draft,
            medications: [...draft.medications, ""],
            medicationDetails: [...draft.medicationDetails, activeMedicationDraft()],
          })}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          <Plus className="h-3.5 w-3.5" weight="regular" /> {t("packet.addMedication")}
        </button>
      </section>

      <section className="py-5">
        <div className="mb-3 flex items-center gap-2">
          <Flask className={`h-4 w-4 ${flagged.labs ? "text-moderate" : "text-ink-muted"}`} weight="regular" />
          <h2 className="text-[12.5px] font-semibold text-ink">{t("packet.keyLabs")}</h2>
          <span className="rounded-full border border-verified-border bg-verified-bg px-2 py-0.5 text-[9.5px] font-semibold text-verified">
            {t("packet.extracted", { count: draft.labs.filter((lab) => lab.name && lab.value).length })}
          </span>
          {flagged.labs ? (
            <span className="rounded-full border border-moderate-border bg-moderate-bg px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-moderate">
              {t("packet.needsReview")}
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-hairline border-y border-hairline">
          {draft.labs.length === 0 ? (
            <p className="py-4 text-[11px] text-ink-faint">{t("packet.noLabs")}</p>
          ) : null}
          {draft.labs.map((lab, index) => (
            <div key={index} className="grid grid-cols-[1fr_0.7fr_0.7fr_auto] items-center gap-3 py-2.5">
              <input
                value={lab.name}
                aria-label={t("packet.labNameLabel", { index: index + 1 })}
                placeholder={t("packet.labName")}
                onChange={(event) => {
                  const labs = [...draft.labs];
                  labs[index] = { ...lab, name: event.target.value };
                  onChange({ ...draft, labs });
                }}
                className={fieldClass}
              />
              <input
                value={lab.value}
                aria-label={t("packet.labValueLabel", { index: index + 1 })}
                inputMode="decimal"
                placeholder={t("packet.value")}
                onChange={(event) => {
                  const labs = [...draft.labs];
                  labs[index] = { ...lab, value: event.target.value };
                  onChange({ ...draft, labs });
                }}
                className={fieldClass}
              />
              <input
                value={lab.unit}
                aria-label={t("packet.labUnitLabel", { index: index + 1 })}
                list={`lab-unit-options-${index + 1}`}
                placeholder={t("packet.unit")}
                onChange={(event) => {
                  const labs = [...draft.labs];
                  labs[index] = { ...lab, unit: event.target.value };
                  onChange({ ...draft, labs });
                }}
                className={fieldClass}
              />
              <datalist id={`lab-unit-options-${index + 1}`}>
                {labUnitOptions(lab.name, lab.unit).map((unit) => <option key={unit} value={unit} />)}
              </datalist>
              <button
                type="button"
                aria-label={t("packet.removeLab", { index: index + 1 })}
                onClick={() => onChange({
                  ...draft,
                  labs: draft.labs.filter((_, labIndex) => labIndex !== index),
                })}
                className="rounded p-1.5 text-ink-faint hover:bg-paper hover:text-major focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                <Trash className="h-3.5 w-3.5" weight="regular" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange({
            ...draft,
            labs: [...draft.labs, { name: "", value: "", unit: "", refLow: "", refHigh: "" }],
          })}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          <Plus className="h-3.5 w-3.5" weight="regular" /> {t("packet.addLab")}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
          {t("packet.unitsHelp")}
        </p>
      </section>

      {onConfirm ? (
        <div className="flex flex-col gap-4 border-t border-hairline py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12.5px] font-semibold text-ink">{t("packet.reviewed")}</p>
            <p id="packet-confirmation-help" className={`mt-1 text-[11px] leading-relaxed ${confirmDisabledReason ? "text-major" : "text-ink-muted"}`}>
              {confirmDisabledReason ?? t("packet.confirmHelp")}
            </p>
          </div>
          <button
            id="confirm-packet"
            type="button"
            data-testid="confirm-packet"
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-describedby="packet-confirmation-help"
            className="shrink-0 rounded-md bg-verified px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#0a3d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verified focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
          >
            {t("packet.confirm")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
