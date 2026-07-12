import { z } from "zod";
import { ClaudeScienceError, claudeScienceReachable, routeToClaudeScience } from "@/lib/claude-science";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  title: z.string().min(1).max(200),
  context: z.string().min(1).max(4_000),
  question: z.string().min(1).max(4_000),
});

export async function GET(): Promise<Response> {
  return Response.json({ available: await claudeScienceReachable() });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "A routed question requires a title, context, and question." }, { status: 400 });
  }
  try {
    const routed = await routeToClaudeScience(parsed.data);
    return Response.json(routed);
  } catch (error) {
    if (error instanceof ClaudeScienceError) {
      return Response.json({ error: error.message, kind: error.kind }, { status: error.kind === "unreachable" ? 503 : 502 });
    }
    return Response.json({ error: "Failed to route the question to Claude Science." }, { status: 500 });
  }
}
