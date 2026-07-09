// Sourced — core domain types.
// Design principle: we never ask the model for a clinical fact. Every clinical
// claim in a report must carry an EvidenceObject proving where it came from.

export type Severity = "major" | "moderate" | "minor";
export type Status = "flagged" | "informational" | "red-flag";

/** A normalized drug from the patient's (possibly Spanish, possibly messy) med list. */
export interface Medication {
  raw: string; // exactly as the pharmacist typed it, e.g. "amiodarona 200mg"
  name: string; // resolved English name, e.g. "Amiodarone"
  rxcui: string | null; // RxNorm concept id; null = unresolved (fail loudly)
  resolution: "exact" | "approximate" | "unresolved";
}

export interface Lab {
  name: string; // e.g. "INR"
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
}

export interface PatientContext {
  note?: string; // free-text discharge note
  medications: Medication[];
  allergies: string[];
  diagnoses: string[];
  labs: Lab[];
}

/**
 * The heart of Sourced. Every clinical claim resolves to one of these.
 * A claim with no EvidenceObject is never asserted.
 */
export interface EvidenceObject {
  id: string; // stable id referenced by report claims
  claim_text: string; // the exact statement this supports
  source_name: "openFDA-label" | "openFDA-FAERS" | "DDInter" | "RxNorm" | "SIDER" | "MedlinePlus";
  source_id: string; // set_id / SPL id / DDInterID / rxcui
  source_url: string; // resolvable link a judge can click
  exact_field?: string; // e.g. "drug_interactions" or the quoted label field
  quoted_text?: string; // verbatim text from the source (verifier checks this matches)
  retrieval_query: string; // the exact query that produced this row
  retrieved_at: string; // ISO timestamp (passed in, never Date.now() in agents)
}

/** One interaction/adverse-effect/monitoring finding, ranked and cited. */
export interface Finding {
  status: Status;
  severity: Severity;
  drugs: string[]; // e.g. ["Warfarin", "Amiodarone"]
  headline: string; // one-line, mechanism-named
  mechanism: string; // e.g. "CYP2C9 inhibition raises S-warfarin levels"
  monitoring?: string; // e.g. "Check INR at start/stop/dose-change"
  why_this_patient: string; // patient-contextualized reasoning (the AI hero work)
  evidence_ids: string[]; // must be non-empty; each maps to an EvidenceObject
}

export interface SafetyReport {
  patient_summary: string;
  findings: Finding[]; // ranked, highest severity first
  questions_for_clinician: string[];
  evidence: EvidenceObject[]; // the full audit ledger
  unverified_removed: { claim_text: string; reason: string }[]; // what the reviewer rejected
  generated_at: string;
}
