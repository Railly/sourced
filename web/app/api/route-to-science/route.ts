import { z } from "zod";
import { ClaudeScienceError, claudeScienceReachable, routeToClaudeScience } from "@/lib/claude-science";
import { generateResearchBrief } from "@/lib/research-brief";

export const runtime = "nodejs";
export const maxDuration = 90;

const requestSchema = z.object({
  candidate: z.object({
    tier: z.enum(["known-unknown", "unresolved-concern"]),
    drugs: z.array(z.string().max(120)).max(8),
    reason: z.string().min(1).max(2_000),
    question: z.string().min(1).max(2_000),
    source: z.string().max(200).default(""),
  }),
  patientSummary: z.string().max(4_000).optional(),
});

function contextFor(drugs: string[]): string {
  const subject = drugs.length > 0 ? drugs.join(" + ") : "a medication-safety question";
  return [
    `This project investigates ${subject}, routed from Sourced.`,
    "Sourced is provenance-first: it never asserts a clinical fact it cannot trace to a cited source (openFDA drug labels, DDInter).",
    "This question could not be resolved from those sources. Investigate with primary literature and structured databases; every claim must be source-backed and citable, and uncertainty must be stated explicitly.",
  ].join(" ");
}

export async function GET(): Promise<Response> {
  return Response.json({ available: await claudeScienceReachable() });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "A routed question requires a valid research candidate." }, { status: 400 });
  }
  const { candidate, patientSummary } = parsed.data;
  try {
    // Craft a precise brief with Opus; fall back to the plain question if it fails.
    let question = candidate.question;
    try {
      question = await generateResearchBrief({ candidate, patientSummary });
    } catch {
      question = candidate.question;
    }

    const routed = await routeToClaudeScience({
      title: `Sourced — ${candidate.drugs.join(" + ") || "medication-safety question"}`,
      context: contextFor(candidate.drugs),
      question,
    });
    return Response.json(routed);
  } catch (error) {
    if (error instanceof ClaudeScienceError) {
      return Response.json({ error: error.message, kind: error.kind }, { status: error.kind === "unreachable" ? 503 : 502 });
    }
    return Response.json({ error: "Failed to route the question to Claude Science." }, { status: 500 });
  }
}
