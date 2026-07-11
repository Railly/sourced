import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-opus-4.8",
  reasoning: "low",
  limits: {
    maxInputTokensPerSession: 16_000,
    maxOutputTokensPerSession: 4_000,
  },
});
