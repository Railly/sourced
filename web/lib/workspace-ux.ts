import type { ReviewCaseDraft } from "@/lib/review-case";

const generalLabUnits = [
  "mmHg",
  "bpm",
  "°C",
  "°F",
  "mg/dL",
  "µmol/L",
  "mmol/L",
  "mEq/L",
  "g/dL",
  "g/L",
  "ng/mL",
  "pg/mL",
  "U/L",
  "IU/L",
  "%",
  "ratio",
  "×10³/µL",
  "×10⁹/L",
];

const specificLabUnits: Array<{ pattern: RegExp; units: string[] }> = [
  { pattern: /\b(bp|blood pressure|systolic|diastolic)\b/i, units: ["mmHg"] },
  { pattern: /\b(hr|heart rate|pulse)\b/i, units: ["bpm"] },
  { pattern: /\b(temp|temperature)\b/i, units: ["°C", "°F"] },
  { pattern: /\b(inr)\b/i, units: ["ratio"] },
  { pattern: /\b(sodium|potassium|chloride|bicarbonate)\b/i, units: ["mmol/L", "mEq/L"] },
  { pattern: /\b(creatinine|glucose|bilirubin)\b/i, units: ["mg/dL", "µmol/L", "mmol/L"] },
  { pattern: /\b(hemoglobin|haemoglobin)\b/i, units: ["g/dL", "g/L"] },
  { pattern: /\b(platelet|wbc|white blood cell)\b/i, units: ["×10³/µL", "×10⁹/L"] },
];

export function labUnitOptions(name: string, currentUnit: string): string[] {
  const specific = specificLabUnits.find((entry) => entry.pattern.test(name))?.units ?? [];
  return [...new Set([currentUnit.trim(), ...specific, ...generalLabUnits].filter(Boolean))];
}

export function canSubmitComposer(options: {
  busy: boolean;
  disabled: boolean;
  deidentified: boolean;
  hasText: boolean;
  hasFile: boolean;
  attachmentLocked: boolean;
  requireText: boolean;
}): boolean {
  if (options.busy || options.disabled || !options.deidentified) return false;
  if (options.requireText) return options.hasText;
  return options.hasText || (options.hasFile && !options.attachmentLocked);
}

export function packetConfirmationBlocker(
  draft: ReviewCaseDraft,
  ambiguityCount: number,
  working: boolean,
  locale: "en" | "es" = "en",
): string | null {
  if (working) return locale === "es"
    ? "Espera a que termine el paso actual antes de confirmar."
    : "Wait for the current step to finish before confirming.";
  if (ambiguityCount > 0) {
    if (locale === "es") {
      return ambiguityCount === 1
        ? "Responde la aclaración o elige Mantener como desconocido para habilitar la confirmación."
        : `Resuelve las ${ambiguityCount} preguntas pendientes para habilitar la confirmación.`;
    }
    return ambiguityCount === 1
      ? "Answer the clarification or choose Keep unknown to enable confirmation."
      : `Resolve the ${ambiguityCount} remaining questions to enable confirmation.`;
  }
  if (!draft.medications.some((medication) => medication.trim())) {
    return locale === "es"
      ? "Agrega al menos un medicamento antes de confirmar la ficha."
      : "Add at least one medication before confirming the packet.";
  }
  const incompleteLab = draft.labs.find((lab) => {
    if (!lab.name.trim() && !lab.value.trim()) return false;
    return !lab.name.trim() || !lab.value.trim() || !Number.isFinite(Number(lab.value));
  });
  if (incompleteLab) return locale === "es"
    ? "Completa o elimina cada fila de análisis antes de confirmar la ficha."
    : "Complete or remove each lab row before confirming the packet.";
  return null;
}
