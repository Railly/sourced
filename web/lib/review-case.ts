import type { MedicationStatus } from "@/lib/types";

export interface ReviewLabDraft {
  name: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
}

export interface ReviewMedicationDraft {
  status: MedicationStatus;
  episode: string;
  start: string;
  end: string;
  sourceSpan: string;
}

export interface ReviewCaseDraft {
  note: string;
  medications: string[];
  medicationDetails: ReviewMedicationDraft[];
  allergies: string;
  diagnoses: string;
  labs: ReviewLabDraft[];
}

export interface ReviewCaseInput {
  note?: string;
  medications: Array<{
    raw: string;
    status?: MedicationStatus;
    episode?: string;
    start?: string;
    end?: string;
    source_span?: string;
  }>;
  allergies: string[];
  diagnoses: string[];
  labs: Array<{
    name: string;
    value: number;
    unit: string;
    refLow?: number;
    refHigh?: number;
  }>;
}

export function activeMedicationDraft(): ReviewMedicationDraft {
  return { status: "active", episode: "", start: "", end: "", sourceSpan: "" };
}

export function emptyReviewCase(): ReviewCaseDraft {
  return {
    note: "",
    medications: [""],
    medicationDetails: [activeMedicationDraft()],
    allergies: "",
    diagnoses: "",
    labs: [{ name: "", value: "", unit: "", refLow: "", refHigh: "" }],
  };
}

export function draftFromCase(value: ReviewCaseInput): ReviewCaseDraft {
  return {
    note: value.note ?? "",
    medications: value.medications.map((medication) => medication.raw),
    medicationDetails: value.medications.map((medication) => ({
      status: medication.status ?? "active",
      episode: medication.episode ?? "",
      start: medication.start ?? "",
      end: medication.end ?? "",
      sourceSpan: medication.source_span ?? "",
    })),
    allergies: value.allergies.join("\n"),
    diagnoses: value.diagnoses.join("\n"),
    labs: value.labs.map((lab) => ({
      name: lab.name,
      value: String(lab.value),
      unit: lab.unit,
      refLow: lab.refLow === undefined ? "" : String(lab.refLow),
      refHigh: lab.refHigh === undefined ? "" : String(lab.refHigh),
    })),
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeReviewCase(draft: ReviewCaseDraft): ReviewCaseInput {
  const medications = draft.medications.flatMap((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const details = draft.medicationDetails[index] ?? activeMedicationDraft();
    return [{
      raw: trimmed,
      status: details.status,
      ...(details.episode.trim() ? { episode: details.episode.trim() } : {}),
      ...(details.start.trim() ? { start: details.start.trim() } : {}),
      ...(details.end.trim() ? { end: details.end.trim() } : {}),
      ...(details.sourceSpan.trim() ? { source_span: details.sourceSpan.trim() } : {}),
    }];
  });
  if (medications.length === 0) throw new Error("Add at least one medication.");

  const labs = draft.labs.flatMap((lab) => {
    if (!lab.name.trim() && !lab.value.trim()) return [];
    const value = Number(lab.value);
    if (!lab.name.trim() || !Number.isFinite(value)) {
      throw new Error("Every lab row needs a name and numeric value.");
    }
    const refLow = lab.refLow.trim() === "" ? undefined : Number(lab.refLow);
    const refHigh = lab.refHigh.trim() === "" ? undefined : Number(lab.refHigh);
    if (refLow !== undefined && !Number.isFinite(refLow)) throw new Error("Lab lower bounds must be numeric.");
    if (refHigh !== undefined && !Number.isFinite(refHigh)) throw new Error("Lab upper bounds must be numeric.");
    return [
      {
        name: lab.name.trim(),
        value,
        unit: lab.unit.trim(),
        ...(refLow === undefined ? {} : { refLow }),
        ...(refHigh === undefined ? {} : { refHigh }),
      },
    ];
  });

  return {
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    medications,
    allergies: lines(draft.allergies),
    diagnoses: lines(draft.diagnoses),
    labs,
  };
}
