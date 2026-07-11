import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { lensModes } from "./spec";

export const reviewCatalog = defineCatalog(schema, {
  components: {
    ReviewStack: {
      props: z.object({ mode: z.enum(lensModes) }),
      slots: ["default"],
      description: "Root layout for one verified-report lens.",
    },
    VerificationSummary: {
      props: z.object({}),
      description: "Verification status sourced from the current report.",
    },
    RiskOverview: {
      props: z.object({ findingIds: z.array(z.string()).min(1).max(6) }),
      description: "Compact ranked list of verified finding identifiers.",
    },
    FindingDetail: {
      props: z.object({ findingId: z.string() }),
      description: "Full verified finding resolved by identifier.",
    },
    EvidencePanel: {
      props: z.object({ evidenceId: z.string() }),
      description: "Exact cited evidence resolved by identifier.",
    },
    QuestionsPanel: {
      props: z.object({ questionIndexes: z.array(z.number().int().nonnegative()).max(8) }),
      description: "Verified clinician questions resolved by index.",
    },
    PairwiseComparison: {
      props: z.object({ findingId: z.string() }),
      description: "Pairwise versus patient-specific comparison for one verified finding.",
    },
  },
  actions: {},
});
