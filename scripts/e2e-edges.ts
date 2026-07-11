import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { codeFingerprint } from "./e2e-oracles";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const artifactDir = join(root, "validation", "e2e");
const session = `sourced-edges-${Date.now()}`;
const runId = new Date().toISOString().replaceAll(":", "-");
const temporary = await mkdtemp(join(tmpdir(), "sourced-edges-"));
const manifest = await Bun.file(join(root, "data", "case-reports", "manifest.json")).json() as { cases: Array<{ id: string }> };
const runCodeFingerprint = await codeFingerprint(root);

await mkdir(artifactDir, { recursive: true });

async function record(type: string, data: Record<string, unknown> = {}): Promise<void> {
  await appendFile(join(artifactDir, "browser-events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), runId, session, mode: "edges", codeFingerprint: runCodeFingerprint, type, ...data })}\n`);
}

async function browser(args: string[], timeoutMs = 120_000): Promise<string> {
  const child = Bun.spawn(["agent-browser", "--namespace", "sourced-e2e", "--session", session, "--ignore-https-errors", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  if (exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed: ${stderr || stdout}`);
  return stdout.trim();
}

function evalResult<T>(output: string): T {
  const last = output.split("\n").filter(Boolean).at(-1);
  if (!last) throw new Error("Browser evaluation returned no value");
  const parsed = JSON.parse(last) as unknown;
  return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as T;
}

async function evaluate<T>(expression: string): Promise<T> {
  return evalResult<T>(await browser(["eval", expression]));
}

async function invalidUpload(path: string, expected: RegExp): Promise<void> {
  await browser(["network", "requests", "--clear"]);
  await browser(["upload", "input[type=file]", path]);
  await browser(["check", "input[type=checkbox]"]);
  await browser(["find", "testid", "composer-continue", "click"]);
  await browser(["wait", "[role=alert]", "--timeout", "30000"]);
  const message = await browser(["get", "text", "[role=alert]"]);
  if (!expected.test(message)) throw new Error(`Unexpected upload error for ${path}: ${message}`);
  const requests = await browser(["network", "requests", "--filter", "/api/intake"]);
  if (!/\s400(?:\s|$)/m.test(requests)) throw new Error(`Invalid upload did not fail with HTTP 400: ${requests}`);
  await record("invalid_upload_passed", { file: path.split("/").at(-1), message, requests });
  await browser(["click", "button[aria-label=\"Remove attachment\"]"]);
}

async function invalidSourceRequest(expression: string, expected: RegExp, label: string): Promise<void> {
  const result = await evaluate<{ status: number; error: string }>(expression);
  if (result.status !== 400 || !expected.test(result.error)) {
    throw new Error(`${label} did not fail closed: ${JSON.stringify(result)}`);
  }
  await record("invalid_source_passed", { label, ...result });
}

try {
  const unsupported = join(temporary, "case.png");
  const malformed = join(temporary, "malformed.pdf");
  const oversized = join(temporary, "oversized.pdf");
  await Bun.write(unsupported, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  await Bun.write(malformed, "%PDF-1.7\nnot a real document");
  await Bun.write(oversized, new Uint8Array(10 * 1024 * 1024 + 1));

  await record("edge_run_started");
  await browser(["open", "https://source.localhost/"]);
  await evaluate(`localStorage.setItem("sourced-locale", "en")`);
  await browser(["reload"]);
  await browser(["set", "viewport", "588", "863"]);
  const empty = await evaluate<{ overflow: number; continueDisabled: boolean; branding: boolean }>(`JSON.stringify({
    overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    continueDisabled: document.querySelector('[data-testid="composer-continue"]')?.disabled === true,
    branding: /Powered by Eve\\.dev|Streaming UI by json-render|Eve\\.dev/i.test(document.body.innerText),
  })`);
  if (empty.overflow > 0 || !empty.continueDisabled || empty.branding) throw new Error(`Invalid mobile empty state: ${JSON.stringify(empty)}`);
  await browser(["find", "testid", "published-cases-trigger", "click"]);
  const gallery = await evaluate<{ count: number; overflow: number; dialog: boolean }>(`JSON.stringify({
    count: document.querySelectorAll('[data-testid^="load-case-"]').length,
    overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    dialog: Boolean(document.querySelector('[role="dialog"]')),
  })`);
  if (gallery.count !== manifest.cases.length || gallery.overflow > 0 || !gallery.dialog) throw new Error(`Invalid mobile gallery: ${JSON.stringify(gallery)}`);
  const initialFocus = await evaluate<string>("JSON.stringify(document.activeElement?.getAttribute('placeholder') ?? '')");
  if (initialFocus !== "Search drug, domain, or PMC ID") throw new Error(`Gallery did not move focus to search: ${initialFocus}`);
  await browser(["fill", "input[placeholder=\"Search drug, domain, or PMC ID\"]", "pregnancy"]);
  const filteredCount = Number(await browser(["get", "count", "[data-testid^=\"load-case-\"]"]));
  if (filteredCount !== 1) throw new Error(`Gallery search returned ${filteredCount} cases instead of 1`);
  await browser(["press", "Escape"]);
  const restoredFocus = await evaluate<string>("JSON.stringify(document.activeElement?.getAttribute('data-testid') ?? '')");
  if (restoredFocus !== "published-cases-trigger") throw new Error(`Gallery did not restore focus: ${restoredFocus}`);
  await record("mobile_layout_passed", { empty, gallery });

  await invalidUpload(unsupported, /Upload a PDF or plain-text clinical note/i);
  await invalidUpload(malformed, /valid, unencrypted PDF/i);
  await invalidUpload(oversized, /smaller than 10 MB/i);

  await invalidSourceRequest(
    `fetch('/api/intake',{method:'POST',body:(()=>{const data=new FormData();data.append('text','A'.repeat(60001));return data})()}).then(async response=>JSON.stringify({status:response.status,error:(await response.json()).error??''}))`,
    /exceeds 60,000 characters/i,
    "oversized extracted text",
  );
  await invalidSourceRequest(
    `fetch('/api/intake',{method:'POST',body:(()=>{const data=new FormData();data.append('text','A valid clinical note with enough source text.');data.append('file',new File(['A second valid text source with enough content.'],'second.txt',{type:'text/plain'}));return data})()}).then(async response=>JSON.stringify({status:response.status,error:(await response.json()).error??''}))`,
    /one clinical source at a time/i,
    "multiple source merge",
  );

  let screenshot = "";
  let screenshotError = "";
  if (process.env.E2E_SCREENSHOTS === "1") {
    try {
      screenshot = join(artifactDir, `${runId}-mobile-edges.png`);
      await browser(["screenshot", screenshot], 15_000);
    } catch (error) {
      screenshot = "";
      screenshotError = error instanceof Error ? error.message : String(error);
    }
  }
  await record("edge_run_passed", { screenshot, screenshotError });
  console.log(JSON.stringify({ ok: true, runId, session }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await record("edge_run_failed", { error: message });
  console.error(JSON.stringify({ ok: false, runId, session, error: message }));
  process.exitCode = 1;
} finally {
  try {
    await browser(["close"]);
  } catch {}
  await rm(temporary, { recursive: true, force: true });
}
