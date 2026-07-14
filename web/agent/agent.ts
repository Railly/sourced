import { createAnthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

// Gateway model string when AI_GATEWAY_API_KEY is set (the deployed default),
// else the Anthropic provider directly with ANTHROPIC_API_KEY so the review
// runs locally without Vercel infra. Kept self-contained (no cross-package
// import) because eve bundles this agent in an isolated worker.
const model = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  ? "anthropic/claude-opus-4.8"
  : createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-opus-4-8");

export default defineAgent({
  model,
  reasoning: "low",
  limits: {
    maxInputTokensPerSession: 16_000,
    maxOutputTokensPerSession: 4_000,
  },
});
