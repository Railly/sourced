import { runVerifiedReview, type ReviewStageEvent } from "@core/review";
import { z } from "zod";
import { hasModelAccess, modelAccessMessage } from "@/lib/intake-extract";
import { reviewCaseInputSchema } from "@/lib/intake";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  prompt: z.string().max(1_000),
  context: z.object({
    case: reviewCaseInputSchema,
    syntheticOrDeidentified: z.literal(true),
    locale: z.enum(["en", "es"]).default("en"),
  }),
});

const encoder = new TextEncoder();

function patch(op: "add" | "replace", path: string, value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify({ op, path, value })}\n`);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const locale = typeof body === "object" && body !== null && "context" in body && typeof body.context === "object" && body.context !== null && "locale" in body.context && body.context.locale === "es" ? "es" : "en";
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: locale === "es" ? "Confirma una ficha válida, sintética o desidentificada." : "Confirm a valid synthetic or de-identified patient packet." }, { status: 400 });
  }
  if (!hasModelAccess()) {
    return Response.json({ error: modelAccessMessage(locale) }, { status: 503 });
  }

  let cancelled = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let completed = false;
      let currentStage: ReviewStageEvent = {
        stage: "ingest",
        status: "running",
        detail: locale === "es" ? "Resolviendo medicamentos" : "Resolving medications",
      };
      const clearHeartbeat = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = undefined;
      };
      const enqueue = (value: Uint8Array): boolean => {
        if (cancelled || completed) return false;
        try {
          controller.enqueue(value);
          return true;
        } catch {
          cancelled = true;
          clearHeartbeat();
          return false;
        }
      };
      const close = () => {
        if (cancelled || completed) return;
        completed = true;
        clearHeartbeat();
        try {
          controller.close();
        } catch {
          cancelled = true;
        }
      };

      enqueue(patch("add", "/root", "workspace"));
      enqueue(
        patch("add", "/elements/workspace", {
          type: "LiveReview",
          visible: true,
          props: { report: null },
          children: ["pipeline"],
        }),
      );
      enqueue(
        patch("add", "/elements/pipeline", {
          type: "PipelineProgress",
          visible: true,
          props: { stage: "ingest", status: "running", detail: locale === "es" ? "Resolviendo medicamentos" : "Resolving medications" },
          children: [],
        }),
      );

      heartbeat = setInterval(() => {
        enqueue(patch("replace", "/elements/pipeline/props", currentStage));
      }, 10_000);

      const onStage = (event: ReviewStageEvent) => {
        currentStage = event;
        enqueue(patch("replace", "/elements/pipeline/props", event));
      };

      void runVerifiedReview(parsed.data.context.case, { onStage, locale: parsed.data.context.locale })
        .then(async (report) => {
          if (cancelled) return;
          enqueue(patch("replace", "/elements/workspace/props", { report }));

          enqueue(
            patch("add", "/elements/verification", {
              type: "VerificationSummary",
              visible: true,
              props: {},
              children: [],
            }),
          );
          enqueue(patch("add", "/elements/workspace/children/-", "verification"));
          await wait(180);

          const findingIds = report.findings.map((_, index) => `finding-${index}`);
          if (findingIds.length > 0) {
            enqueue(
              patch("add", "/elements/risks", {
                type: "RiskOverview",
                visible: true,
                props: { findingIds },
                children: [],
              }),
            );
            enqueue(patch("add", "/elements/workspace/children/-", "risks"));
            await wait(180);
          }

          for (const findingId of findingIds) {
            enqueue(
              patch("add", `/elements/${findingId}`, {
                type: "FindingDetail",
                visible: true,
                props: { findingId },
                children: [],
              }),
            );
            enqueue(patch("add", "/elements/workspace/children/-", findingId));
            await wait(180);
          }

          if (report.questions_for_clinician.length > 0) {
            enqueue(
              patch("add", "/elements/questions", {
                type: "QuestionsPanel",
                visible: true,
                props: {
                  questionIndexes: report.questions_for_clinician.map((_, index) => index),
                },
                children: [],
              }),
            );
            enqueue(patch("add", "/elements/workspace/children/-", "questions"));
          }
          close();
        })
        .catch(() => {
          if (cancelled || completed) return;
          const detail = locale === "es" ? "La revisión verificada no pudo completarse." : "The verified review could not complete.";
          enqueue(
            patch("replace", "/elements/pipeline/props", {
              stage: "verify",
              status: "error",
              detail: detail.slice(0, 400),
            }),
          );
          close();
        });
    },
    cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
