import type {
  EvidenceObject,
  Finding,
  PatientContext,
  SafetyReport,
  Severity,
  Status,
} from "../types/index.ts";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface SynthesisOutput {
  plan: string[];
  patient_summary: string;
  findings: Finding[];
  questions_for_clinician: string[];
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[];
}

const statusValues = new Set<Status>(["flagged", "informational", "red-flag"]);
const severityValues = new Set<Severity>(["major", "moderate", "minor"]);

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["plan", "patient_summary", "findings", "questions_for_clinician"],
  properties: {
    plan: {
      type: "array",
      minItems: 3,
      items: { type: "string", minLength: 1 },
    },
    patient_summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "status",
          "severity",
          "drugs",
          "headline",
          "mechanism",
          "why_this_patient",
          "evidence_ids",
        ],
        properties: {
          status: { type: "string", enum: ["flagged", "informational", "red-flag"] },
          severity: { type: "string", enum: ["major", "moderate", "minor"] },
          drugs: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          headline: { type: "string", minLength: 1 },
          mechanism: { type: "string", minLength: 1 },
          monitoring: { type: "string", minLength: 1 },
          why_this_patient: { type: "string", minLength: 1 },
          evidence_ids: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    questions_for_clinician: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

function buildSystemPrompt(evidenceIds: string[]): string {
  return [
    "You are the SYNTHESIZE layer for Sourced, a medication-safety tool.",
    "HARD CONTRACT: You may only reason over the provided evidence objects. You may not introduce any interaction, adverse-effect, severity, or monitoring claim not present in the retrieved sources. If you cannot cite an evidence_id for a claim, omit the claim.",
    "The model receives only PatientContext and EvidenceObject array. Do not use outside medical knowledge.",
    "Your jobs are: emit a visible PLAN first, screen each pair against interaction evidence, screen each drug against the patient's labs/allergies/diagnoses, rank findings highest severity first, and contextualize why_this_patient against this patient's context.",
    "Every Finding must have non-empty evidence_ids. Every evidence_id must be one of these ids: " +
      evidenceIds.join(", "),
    "Patient medication names, RxCUIs, labs, diagnoses, allergies, and note text are patient context only. They are not clinical evidence for an interaction, adverse effect, therapeutic equivalence, severity, or monitoring claim.",
    "When mentioning a lab, preserve the exact value and reference bounds. Do not call a value top, bottom, high, low, near, or borderline unless that description follows exactly from the supplied bounds.",
    "Use conservative patient-context language. Do not call the context an exact or classic scenario for a source; state only the specific facts that match.",
    "When cited timing makes a current patient value clinically relevant, explain the possible future change with may or could language and never state that the outcome will occur.",
    "Use one uncertainty word, not combinations such as may or could.",
    "Do not create medication-reconciliation or duplicate-therapy findings unless an EvidenceObject explicitly supports the therapeutic-equivalence claim.",
    "Do not create findings for DDInter Unknown pairs unless another EvidenceObject supports a concrete interaction, adverse effect, severity, or monitoring claim for that pair.",
    "A Finding must assert a concrete, supported safety issue. A statement that no interaction or no concrete claim is supported is not a Finding; omit it entirely.",
    "Questions for the clinician must not introduce dosing, monitoring, interaction, adverse-effect, or renal-adjustment claims unsupported by the provided EvidenceObjects.",
    "Do not ask whether to adjust a medication based only on a lab value unless cited evidence explicitly connects that medication, lab, and action.",
    "Questions must not assume their answer. Ask whether duplicate-looking entries are one order or separate orders rather than assuming a single intended order.",
    "JSON schema: " + JSON.stringify(outputSchema),
    "Return only JSON matching the provided schema. Do not wrap JSON in markdown.",
  ].join("\n");
}

function buildUserPrompt(patient: PatientContext, evidence: EvidenceObject[]): string {
  return JSON.stringify(
    {
      patient,
      evidence,
    },
    null,
    2,
  );
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("synthesize: model did not return JSON");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function asStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    throw new Error(`synthesize: invalid ${field}`);
  }
  return value;
}

function asFinding(value: unknown, index: number): Finding {
  if (typeof value !== "object" || value === null) {
    throw new Error(`synthesize: invalid finding at index ${index}`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !statusValues.has(record.status as Status)) {
    throw new Error(`synthesize: invalid finding status at index ${index}`);
  }
  if (typeof record.severity !== "string" || !severityValues.has(record.severity as Severity)) {
    throw new Error(`synthesize: invalid finding severity at index ${index}`);
  }
  if (
    typeof record.headline !== "string" ||
    typeof record.mechanism !== "string" ||
    typeof record.why_this_patient !== "string"
  ) {
    throw new Error(`synthesize: invalid finding text at index ${index}`);
  }
  const finding: Finding = {
    status: record.status as Status,
    severity: record.severity as Severity,
    drugs: asStringArray(record.drugs, `finding ${index} drugs`),
    headline: record.headline,
    mechanism: record.mechanism,
    why_this_patient: record.why_this_patient,
    evidence_ids: asStringArray(record.evidence_ids, `finding ${index} evidence_ids`),
  };
  if (typeof record.monitoring === "string" && record.monitoring.trim().length > 0) {
    finding.monitoring = record.monitoring;
  }
  return finding;
}

function parseSynthesisOutput(text: string): SynthesisOutput {
  const parsed = parseJsonObject(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("synthesize: model JSON was not an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.patient_summary !== "string" || record.patient_summary.trim().length === 0) {
    throw new Error("synthesize: invalid patient_summary");
  }
  if (!Array.isArray(record.findings)) {
    throw new Error("synthesize: invalid findings");
  }
  return {
    plan: asStringArray(record.plan, "plan"),
    patient_summary: record.patient_summary,
    findings: record.findings.map((finding, index) => asFinding(finding, index)),
    questions_for_clinician: asStringArray(
      record.questions_for_clinician,
      "questions_for_clinician",
    ),
  };
}

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as AnthropicMessageResponse;
  const text = data.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic API returned no text content");
  }
  return text;
}

async function callClaudePrint(systemPrompt: string, userPrompt: string): Promise<string> {
  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      "--model",
      MODEL,
      "--tools",
      "",
      "--no-session-persistence",
      "--system-prompt",
      systemPrompt,
      "--json-schema",
      JSON.stringify(outputSchema),
    ],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  proc.stdin.write(userPrompt);
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`claude -p failed: ${stderr || stdout}`);
  }
  return stdout.trim();
}

function printPlan(plan: string[]): void {
  console.error("PLAN");
  for (let i = 0; i < plan.length; i++) {
    console.error(`${i + 1}. ${plan[i]}`);
  }
}

export async function synthesize(
  patient: PatientContext,
  evidence: EvidenceObject[],
  now: string,
): Promise<SafetyReport> {
  const systemPrompt = buildSystemPrompt(evidence.map((item) => item.id));
  const userPrompt = buildUserPrompt(patient, evidence);

  let rawOutput: string;
  try {
    rawOutput = await callAnthropic(systemPrompt, userPrompt);
  } catch {
    rawOutput = await callClaudePrint(systemPrompt, userPrompt);
  }

  const output = parseSynthesisOutput(rawOutput);
  printPlan(output.plan);

  return {
    patient_summary: output.patient_summary,
    findings: output.findings,
    questions_for_clinician: output.questions_for_clinician,
    evidence,
    unverified_removed: [],
    generated_at: now,
  };
}
