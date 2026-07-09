export type Severity = "major" | "moderate" | "minor";
export type Status = "flagged" | "informational" | "red-flag";

export interface EvidenceObject {
  id: string;
  claim_text: string;
  source_name: "openFDA-label" | "openFDA-FAERS" | "DDInter" | "RxNorm" | "SIDER" | "MedlinePlus";
  source_id: string;
  source_url: string;
  exact_field?: string;
  quoted_text?: string;
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

export interface UnverifiedClaim {
  claim_text: string;
  reason: string;
}

export interface SafetyReport {
  patient_summary: string;
  findings: Finding[];
  questions_for_clinician: string[];
  evidence: EvidenceObject[];
  unverified_removed: UnverifiedClaim[];
  generated_at: string;
}
