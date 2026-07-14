import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

// Resolves the model handle for AI SDK calls (generateObject/generateText).
// Prefers the Vercel AI Gateway when its key is present (the deployed default),
// and otherwise talks to the Anthropic API directly with ANTHROPIC_API_KEY so
// the app runs locally without any Vercel infrastructure. The gateway model
// ids ("anthropic/claude-opus-4.8") map to the direct provider's dashed ids.
const DIRECT_ID: Record<string, string> = {
  "anthropic/claude-opus-4.8": "claude-opus-4-8",
  "anthropic/claude-sonnet-5": "claude-sonnet-5",
};

export function canRunLiveModel(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.ANTHROPIC_API_KEY,
  );
}

export function resolveModel(gatewayId: string): LanguageModel {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return gatewayId as LanguageModel;
  }
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic(DIRECT_ID[gatewayId] ?? gatewayId.replace(/^anthropic\//, ""));
}
