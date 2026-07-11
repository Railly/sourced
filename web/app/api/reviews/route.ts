import { runVerifiedReview, type ReviewStageEvent } from "@core/review";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const caseSchema = z.object({
  note: z.string().max(12_000).optional(),
  medications: z.array(z.object({ raw: z.string().min(1).max(240) })).min(1).max(40),
  allergies: z.array(z.string().max(240)).max(40),
  diagnoses: z.array(z.string().max(480)).max(40),
  labs: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        value: z.number().finite(),
        unit: z.string().max(80),
        refLow: z.number().finite().optional(),
        refHigh: z.number().finite().optional(),
      }),
    )
    .max(60),
});

const requestSchema = z.object({
  case: caseSchema,
  syntheticOrDeidentified: z.literal(true),
});

function line(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Enter a valid synthetic or de-identified case before running the review." },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pushStage = (event: ReviewStageEvent) => controller.enqueue(line({ type: "stage", ...event }));
      void runVerifiedReview(parsed.data.case, { onStage: pushStage })
        .then((report) => {
          controller.enqueue(line({ type: "report", report }));
          controller.close();
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Review failed";
          controller.enqueue(line({ type: "error", error: message.slice(0, 600) }));
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}
