import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE = process.env.CLAUDE_SCIENCE_URL ?? "http://localhost:8765";
const ORIGIN = BASE;
const CLI = process.env.CLAUDE_SCIENCE_BIN ?? "claude-science";

export interface RoutedResearch {
  projectId: string;
  frameId: string;
  projectUrl: string;
}

export class ClaudeScienceError extends Error {
  constructor(message: string, readonly kind: "unreachable" | "auth" | "write" = "write") {
    super(message);
  }
}

/**
 * The Claude Science daemon authenticates with a single-use nonce (printed by
 * the CLI) exchanged for an operon_auth session cookie, then guards every write
 * with an operon_csrf double-submit cookie plus a same-origin check. This client
 * replays that handshake server-side so Sourced can hand a routed research
 * question to Claude Science over the local daemon.
 */
function parseCookies(setCookie: string[] | null, jar: Map<string, string>): void {
  for (const line of setCookie ?? []) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function isReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function nonce(): Promise<string> {
  const { stdout } = await execFileAsync(CLI, ["url"], { timeout: 8_000 });
  const match = stdout.match(/nonce=([a-f0-9]+)/);
  if (!match?.[1]) throw new ClaudeScienceError("Could not obtain a Claude Science login nonce.", "auth");
  return match[1];
}

async function authenticate(jar: Map<string, string>): Promise<void> {
  const authRes = await fetch(`${BASE}/api/auth/nonce`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `nonce=${await nonce()}&dest=/`,
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
  });
  parseCookies(authRes.headers.getSetCookie(), jar);
  if (!jar.has("operon_auth")) throw new ClaudeScienceError("Claude Science rejected the login nonce.", "auth");
  // The operon_csrf token is issued on a normal document GET, not on the nonce POST.
  const csrfRes = await fetch(`${BASE}/`, { headers: { cookie: cookieHeader(jar) }, signal: AbortSignal.timeout(8_000) });
  parseCookies(csrfRes.headers.getSetCookie(), jar);
  if (!jar.has("operon_csrf")) throw new ClaudeScienceError("Claude Science did not issue a CSRF token.", "auth");
}

async function write<T>(jar: Map<string, string>, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": cookieHeader(jar),
      "origin": ORIGIN,
      "x-operon-csrf": jar.get("operon_csrf") ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new ClaudeScienceError(`Claude Science write failed (${response.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/**
 * Creates a dedicated Claude Science project for a routed research question and
 * opens a session on it. Returns the project + frame ids and a deep link.
 */
export async function routeToClaudeScience(input: {
  title: string;
  context: string;
  question: string;
  model?: string;
}): Promise<RoutedResearch> {
  if (!(await isReachable())) {
    throw new ClaudeScienceError("Claude Science is not running on this machine. Start it with `claude-science serve`.", "unreachable");
  }
  const jar = new Map<string, string>();
  await authenticate(jar);

  const project = await write<{ project_id: string }>(jar, "/api/projects", {
    name: input.title.slice(0, 120),
    description: "Routed from Sourced — a medication-safety question that could not be resolved from cited sources.",
    context: input.context,
  });

  const frame = await write<{ frame_id: string }>(jar, `/api/projects/${project.project_id}/request`, {
    // Claude Science runs its reviewer agent by default (checks citations and
    // calculations) — the same refuse-to-assert discipline Sourced applies.
    input_data: { request: input.question },
    model: input.model ?? "claude-opus-4-8",
  });

  return {
    projectId: project.project_id,
    frameId: frame.frame_id,
    // Deep link straight to the running research frame, not just the project
    // shell, so "Open session" lands on the live agent output.
    projectUrl: `${BASE}/projects/${project.project_id}/frames/${frame.frame_id}`,
  };
}

export async function claudeScienceReachable(): Promise<boolean> {
  return isReachable();
}
