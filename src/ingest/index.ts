import type {
  Lab,
  MedicationDuplicate,
  MedicationStatus,
  PatientContext,
} from "../types/index.ts";
import { normalizeMedication } from "./rxnav.ts";

interface RawLab {
  name: string;
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
}

interface RawMedication {
  raw: string;
  status: MedicationStatus;
  episode?: string;
  start?: string;
  end?: string;
  source_span?: string;
}

interface RawPatientContext {
  note?: string;
  medications?: RawMedication[];
  allergies?: string[];
  diagnoses?: string[];
  labs?: RawLab[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMedicationStatus(value: unknown): value is MedicationStatus {
  return (
    value === "active" ||
    value === "historical" ||
    value === "held" ||
    value === "stopped" ||
    value === "one-time" ||
    value === "indirect-exposure" ||
    value === "uncertain"
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toRawMedication(value: Record<string, unknown>): RawMedication {
  const medication: RawMedication = {
    raw: String(value.raw),
    status: value.status === undefined
      ? "active"
      : isMedicationStatus(value.status)
        ? value.status
        : "uncertain",
  };
  const episode = optionalString(value.episode);
  const start = optionalString(value.start);
  const end = optionalString(value.end);
  const sourceSpan = optionalString(value.source_span);
  if (episode) medication.episode = episode;
  if (start) medication.start = start;
  if (end) medication.end = end;
  if (sourceSpan) medication.source_span = sourceSpan;
  return medication;
}

function parseRaw(raw: unknown): RawPatientContext {
  if (!isRecord(raw)) {
    throw new Error("ingest: input must be a JSON object");
  }

  const medications = Array.isArray(raw.medications)
    ? raw.medications.flatMap((medication) =>
        isRecord(medication) && typeof medication.raw === "string"
          ? [toRawMedication(medication)]
          : [],
      )
    : [];

  const allergies = Array.isArray(raw.allergies)
    ? raw.allergies.filter((a): a is string => typeof a === "string")
    : [];

  const diagnoses = Array.isArray(raw.diagnoses)
    ? raw.diagnoses.filter((d): d is string => typeof d === "string")
    : [];

  const labs = Array.isArray(raw.labs)
    ? raw.labs.filter(
        (l): l is RawLab =>
          isRecord(l) && typeof l.name === "string" && typeof l.value === "number" && typeof l.unit === "string",
      )
    : [];

  return {
    note: typeof raw.note === "string" ? raw.note : undefined,
    medications,
    allergies,
    diagnoses,
    labs,
  };
}

function toLab(raw: RawLab): Lab {
  const lab: Lab = { name: raw.name, value: raw.value, unit: raw.unit };
  if (raw.refLow !== undefined) lab.refLow = raw.refLow;
  if (raw.refHigh !== undefined) lab.refHigh = raw.refHigh;
  return lab;
}

function findDuplicateMedications(
  medications: PatientContext["medications"],
): MedicationDuplicate[] {
  const byIngredient = new Map<
    string,
    { name: string; medications: MedicationDuplicate["medications"] }
  >();
  for (const medication of medications) {
    if ((medication.status ?? "active") !== "active") continue;
    if (!medication.rxcui) continue;
    for (const ingredient of medication.ingredients ?? []) {
      const group = byIngredient.get(ingredient.rxcui) ?? { name: ingredient.name, medications: [] };
      group.medications.push({
        raw: medication.raw,
        name: medication.name,
        rxcui: medication.rxcui,
      });
      byIngredient.set(ingredient.rxcui, group);
    }
  }
  return [...byIngredient.entries()].flatMap(([ingredientRxcui, group]) => {
    const uniqueConcepts = new Set(group.medications.map((medication) => medication.rxcui));
    if (group.medications.length < 2 || uniqueConcepts.size < 2) return [];
    return [
      {
        ingredient_rxcui: ingredientRxcui,
        ingredient_name: group.name,
        medications: group.medications,
      },
    ];
  });
}

/**
 * Parses raw discharge-note JSON and normalizes every medication against
 * RxNav. Medication normalization runs in parallel; a single drug failing
 * to resolve never aborts the rest of the ingest (see normalizeMedication).
 */
export async function ingest(raw: unknown): Promise<PatientContext> {
  const parsed = parseRaw(raw);

  const medications = await Promise.all(
    (parsed.medications ?? []).map((med) => normalizeMedication(med.raw, med)),
  );

  const context: PatientContext = {
    medications,
    allergies: parsed.allergies ?? [],
    diagnoses: parsed.diagnoses ?? [],
    labs: (parsed.labs ?? []).map(toLab),
  };

  const duplicateMedications = findDuplicateMedications(medications);
  if (duplicateMedications.length > 0) context.duplicate_medications = duplicateMedications;

  if (parsed.note !== undefined) {
    context.note = parsed.note;
  }

  return context;
}
