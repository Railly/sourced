import { defineTool } from "eve/tools";
import { safeSpecSchema, validateSafeSpec } from "../../lib/genui/spec";
import { z } from "zod";

const outputSchema = z.object({
  kind: z.literal("review-lens"),
  spec: safeSpecSchema,
});

export default defineTool({
  description:
    "Render a constrained UI lens over an already verified Sourced report. Props may contain only report identifiers and fixed layout modes.",
  inputSchema: z.object({ spec: safeSpecSchema }),
  outputSchema,
  execute({ spec }) {
    return { kind: "review-lens" as const, spec: validateSafeSpec(spec) };
  },
  toModelOutput() {
    return { type: "text", value: "The verified-report view was rendered successfully." };
  },
});
