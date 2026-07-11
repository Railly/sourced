import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const liveReviewCatalog = defineCatalog(schema, {
  components: {
    LiveReview: {
      props: z.object({ report: z.unknown().nullable() }),
      slots: ["default"],
      description: "Root for a progressively streamed verified review.",
    },
    PipelineProgress: {
      props: z.object({
        stage: z.enum(["ingest", "retrieve", "synthesize", "verify"]),
        status: z.enum(["running", "completed", "error"]),
        detail: z.string().optional(),
      }),
      description: "Current deterministic review pipeline stage.",
    },
    VerificationSummary: {
      props: z.object({}),
      description: "Verification status from the completed canonical report.",
    },
    RiskOverview: {
      props: z.object({ findingIds: z.array(z.string()).min(1).max(6) }),
      description: "Ranked verified findings resolved from report identifiers.",
    },
    FindingDetail: {
      props: z.object({ findingId: z.string() }),
      description: "One verified finding with its exact cited evidence.",
    },
    QuestionsPanel: {
      props: z.object({ questionIndexes: z.array(z.number().int().nonnegative()).max(8) }),
      description: "Clinician questions from the canonical report.",
    },
  },
  actions: {},
});

