import { generateText } from "ai";
import { resolveModel } from "@core/model";
import type { ResearchCandidate } from "@/lib/types";

const TIER_FRAMING: Record<ResearchCandidate["tier"], string> = {
  "known-unknown":
    "The interaction database (DDInter) catalogues this drug pair but assigns no graded severity. Sourced will not invent a severity it cannot source, so the pair is unresolved.",
  "unresolved-concern":
    "Sourced's adversarial verifier flagged a plausible safety concern but removed it from the report because it could not be traced to a cited source (openFDA labels, DDInter).",
};

/**
 * Expands a routed research candidate into a precise, Claude-Science-ready
 * research brief using Opus — the same model Sourced's pipeline uses. A tailored
 * brief (patient context, what Sourced already checked, which databases to hit,
 * output constraints) gets a far better investigation than a bare question. If
 * generation fails, the caller falls back to the candidate's plain question.
 */
export async function generateResearchBrief(input: {
  candidate: ResearchCandidate;
  patientSummary?: string;
}): Promise<string> {
  const { candidate, patientSummary } = input;
  const drugs = candidate.drugs.length > 0 ? candidate.drugs.join(" + ") : "the medications in question";

  const { text } = await generateText({
    model: resolveModel("anthropic/claude-opus-4.8"),
    abortSignal: AbortSignal.timeout(30_000),
    system:
      "You write research briefs for Claude Science, an AI workbench for scientists with access to primary literature and structured databases (PubMed, DrugBank, ChEMBL, ClinVar, UniProt, and drug-label/pharmacokinetic sources). You are handed a medication-safety question that a provenance-first tool (Sourced) could not resolve from its cited sources. Turn it into ONE precise, self-contained research brief that a scientific agent can act on. Requirements: state the specific pharmacological question; give the de-identified patient context if provided; name what has already been checked and why it was inconclusive; suggest concrete investigative angles (CYP450 and transporter pathways, pharmacokinetic interaction data, case reports, mechanism); and end with output constraints: every claim must be source-backed and cited, quantify severity and mechanism only where evidence supports it, and explicitly flag what remains uncertain. Do not fabricate any interaction, severity, dose, or mechanism. Write in clear scientific English, 120-200 words, no preamble, no markdown headers.",
    prompt: [
      `Drug pair or subject: ${drugs}.`,
      `Question Sourced routed: ${candidate.question}`,
      `Why it is unresolved: ${TIER_FRAMING[candidate.tier]} Basis: ${candidate.reason}`,
      patientSummary ? `De-identified patient context from Sourced: ${patientSummary}` : "No patient context was provided.",
    ].join("\n"),
  });

  return text.trim() || candidate.question;
}
