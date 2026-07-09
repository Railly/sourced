// Shared Opus caller. Prefers the Anthropic API when ANTHROPIC_API_KEY is set,
// falls back to `claude -p` (Max plan, no key). Used by synthesize and verify.

const MODEL = "claude-opus-4-8";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface TextBlock {
  type: string;
  text?: string;
}

async function callAnthropic(
  system: string,
  user: string,
  schema: unknown,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
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
  const proc = Bun.spawn(
    [
      "claude",
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
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );

  proc.stdin.write(user);
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) throw new Error(`claude -p failed: ${stderr || stdout}`);
  return stdout.trim();
}

/** Call Opus, API first then CLI fallback, returning raw text (JSON expected). */
export async function callOpus(system: string, user: string, schema: unknown): Promise<string> {
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
