// Shared Opus caller. Prefers the Anthropic API when ANTHROPIC_API_KEY is set,
// falls back to `claude -p` (Max plan, no key). Used by synthesize and verify.

import { spawn } from "node:child_process";
import { generateObject, jsonSchema } from "ai";

const MODEL = "claude-opus-4-8";
const GATEWAY_MODEL = "anthropic/claude-opus-4.8";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const GATEWAY_TIMEOUT_MS = 110_000;
const API_TIMEOUT_MS = 120_000;
const CLI_TIMEOUT_MS = 180_000;
const MAX_PROCESS_OUTPUT = 2_000_000;

interface TextBlock {
  type: string;
  text?: string;
}

async function callGateway(
  system: string,
  user: string,
  schema: unknown,
): Promise<string> {
  const result = await generateObject({
    model: GATEWAY_MODEL,
    abortSignal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    maxRetries: 1,
    maxOutputTokens: 16_000,
    schema: jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
    system,
    prompt: user,
    temperature: 0,
  });
  return JSON.stringify(result.object);
}

async function callAnthropic(
  system: string,
  user: string,
  schema: unknown,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { content?: TextBlock[] };
  const text = data.content
    ?.filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic API returned no text content");
  return text;
}

async function callClaudePrint(
  system: string,
  user: string,
  schema: unknown,
): Promise<string> {
  const proc = spawn(
    "claude",
    [
      "-p",
      "--model",
      MODEL,
      "--tools",
      "",
      "--no-session-persistence",
      "--system-prompt",
      system,
      "--json-schema",
      JSON.stringify(schema),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    stdout = `${stdout}${chunk}`.slice(-MAX_PROCESS_OUTPUT);
  });
  proc.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-MAX_PROCESS_OUTPUT);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, CLI_TIMEOUT_MS);
    proc.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    proc.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
    proc.stdin.end(user);
  });

  if (timedOut) throw new Error(`claude -p timed out after ${CLI_TIMEOUT_MS}ms`);
  if (exitCode !== 0) throw new Error(`claude -p failed: ${stderr || stdout}`);
  return stdout.trim();
}

/** Call Opus, API first then CLI fallback, returning raw text (JSON expected). */
export async function callOpus(system: string, user: string, schema: unknown): Promise<string> {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return callGateway(system, user, schema);
  }
  try {
    return await callAnthropic(system, user, schema);
  } catch {
    return await callClaudePrint(system, user, schema);
  }
}

export function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("model did not return JSON");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}
