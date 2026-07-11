export type Severity = "major" | "moderate" | "minor";
export type Status = "flagged" | "informational" | "red-flag";
export type MedicationStatus =
  | "active"
  | "historical"
  | "held"
  | "stopped"
  | "one-time"
  | "indirect-exposure"
  | "uncertain";

export interface EvidenceObject {
  id: string;
  claim_text: string;
  source_name: "openFDA-label" | "openFDA-FAERS" | "DDInter" | "RxNorm" | "SIDER" | "MedlinePlus";
  source_id: string;
  source_url: string;
  exact_field?: string;
  quoted_text?: string;
  supporting_text?: string;
  source_version?: string;
  subject_drugs?: string[];
  anchor_drug?: string;
  retrieval_query: string;
  retrieved_at: string;
}

export interface Finding {
  status: Status;
  severity: Severity;
  drugs: string[];
  headline: string;
  mechanism: string;
  monitoring?: string;
  why_this_patient: string;
  evidence_ids: string[];
}

export interface Medication {
  raw: string;
  name: string;
  rxcui: string | null;
  resolution: "exact" | "approximate" | "unresolved";
  ingredients?: { rxcui: string; name: string }[];
  status?: MedicationStatus;
  episode?: string;
  start?: string;
  end?: string;
  source_span?: string;
}

export interface PatientContext {
  note?: string;
  medications: Medication[];
  allergies: string[];
  diagnoses: string[];
  labs: Array<{ name: string; value: number; unit: string; refLow?: number; refHigh?: number }>;
  duplicate_medications?: Array<{
    ingredient_rxcui: string;
    ingredient_name: string;
    medications: { raw: string; name: string; rxcui: string }[];
  }>;
}

export interface UnverifiedClaim {
  claim_text: string;
  reason: string;
}

export interface SafetyReport {
  patient?: PatientContext;
  patient_summary: string;
  findings: Finding[];
  questions_for_clinician: string[];
  evidence: EvidenceObject[];
  unverified_removed: UnverifiedClaim[];
  generated_at: string;
  pipeline?: {
    mode: "live" | "audited-replay";
    model: string;
    stages: Array<"ingest" | "retrieve" | "synthesize" | "verify">;
    ddinter: {
      source_rows: number;
      unique_pairs: number;
      unique_drugs: number;
      source_files: number;
    };
  };
}
