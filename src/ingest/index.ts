import type { Lab, PatientContext } from "../types/index.ts";
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

function parseRaw(raw: unknown): RawPatientContext {
  if (!isRecord(raw)) {
    throw new Error("ingest: input must be a JSON object");
  }

  const medications = Array.isArray(raw.medications)
    ? raw.medications.filter(
        (m): m is RawMedication => isRecord(m) && typeof m.raw === "string",
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

/**
 * Parses raw discharge-note JSON and normalizes every medication against
 * RxNav. Medication normalization runs in parallel; a single drug failing
 * to resolve never aborts the rest of the ingest (see normalizeMedication).
 */
export async function ingest(raw: unknown): Promise<PatientContext> {
  const parsed = parseRaw(raw);

  const medications = await Promise.all(
    (parsed.medications ?? []).map((med) => normalizeMedication(med.raw)),
  );

  const context: PatientContext = {
    medications,
    allergies: parsed.allergies ?? [],
    diagnoses: parsed.diagnoses ?? [],
    labs: (parsed.labs ?? []).map(toLab),
  };

  if (parsed.note !== undefined) {
    context.note = parsed.note;
  }

  return context;
}
