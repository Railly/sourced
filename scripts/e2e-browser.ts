import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { assertClinicalOracles, codeFingerprint } from "./e2e-oracles";

interface PublishedCase {
  id: string;
  pmcid: string;
  pdf_url?: string;
  expected_medications?: string[];
  expected_active_medications?: string[];
  forbidden_active_medications?: string[];
  expected_surviving_pairs?: string[][];
  forbidden_pairs?: string[][];
  qualification_mode?: "full" | "intake";
  clarification_answers?: Array<{ match: string; answer: string }>;
}

interface BrowserState {
  url: string;
  heading: string;
  body: string;
  error: string;
  meds: string[];
  activeMeds: string[];
  medicationStatuses: string[];
  medicationStatusCount: number;
  activeAmbiguityId: string;
  activeAmbiguityQuestion: string;
  confirmEnabled: boolean;
  composerEnabled: boolean;
  phase: string;
  pipelineStage: string;
  pipelineStatus: string;
  pipelineHistory: string[];
  verified: boolean;
  researchCount: number;
  overflow: number;
  citationCount: number;
  reportFindingCount: number | null;
  findings: Array<{
    drugs: string[] | null;
    citationCount: number | null;
    renderedCitationCount: number;
  }>;
  rejections: Array<{ claim: string; reason: string }>;
}

type Mode = "smoke" | "intake" | "full";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const artifactDir = join(root, "validation", "e2e");
const manifest = await Bun.file(join(root, "data", "case-reports", "manifest.json")).json() as { cases: PublishedCase[] };
const webDataset = await Bun.file(join(root, "web", "public", "data", "published-cases.json")).json() as { cases: Array<{ id: string; pdf_url: string }> };
const webCases = webDataset.cases;
const webCaseMap = new Map(webCases.map((item) => [item.id, item]));
let latestBrowserState: BrowserState | null = null;

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

const mode = (argument("--mode") ?? "full") as Mode;
const locale = argument("--locale") === "es" ? "es" : "en";
const caseId = argument("--case") ?? manifest.cases[0]?.id;
const session = argument("--session") ?? `sourced-${Date.now()}`;
const baseUrl = argument("--url") ?? "https://source.localhost/";
const soakId = argument("--soak-id") ?? null;
const expectedCodeFingerprint = argument("--code-fingerprint") ?? null;
const keepOpen = Bun.argv.includes("--keep-open");
const runId = `${new Date().toISOString().replaceAll(":", "-")}-${caseId}-${mode}-${locale}`;
const expectedOrigin = new URL(baseUrl).origin;
const selectedMatch = manifest.cases.find((item) => item.id === caseId);
const runCodeFingerprint = await codeFingerprint(root);

if (!selectedMatch) throw new Error(`Unknown case: ${caseId}`);
const selected: PublishedCase = selectedMatch;
if (!(["smoke", "intake", "full"] as string[]).includes(mode)) throw new Error(`Unknown mode: ${mode}`);
if (expectedCodeFingerprint && expectedCodeFingerprint !== runCodeFingerprint) {
  throw new Error(`Code fingerprint changed before browser run: expected ${expectedCodeFingerprint}, received ${runCodeFingerprint}`);
}

function requiredArray<T>(value: T[] | undefined, field: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${selected.id} is missing manifest field ${field}`);
  return value;
}

const expectedActiveMedications = mode === "smoke"
  ? []
  : requiredArray(selected.expected_active_medications, "expected_active_medications");
const forbiddenActiveMedications = mode === "smoke"
  ? []
  : requiredArray(selected.forbidden_active_medications, "forbidden_active_medications");
const expectedSurvivingPairs = mode === "full"
  ? requiredArray(selected.expected_surviving_pairs, "expected_surviving_pairs")
  : [];
const forbiddenPairs = mode === "full"
  ? requiredArray(selected.forbidden_pairs, "forbidden_pairs")
  : [];

await mkdir(artifactDir, { recursive: true });

async function record(type: string, data: Record<string, unknown> = {}): Promise<void> {
  await appendFile(join(artifactDir, "browser-events.jsonl"), `${JSON.stringify({
    at: new Date().toISOString(),
    runId,
    session,
    soakId,
    codeFingerprint: runCodeFingerprint,
    caseId,
    mode,
    type,
    ...data,
  })}\n`);
}

async function browser(args: string[], timeoutMs = 120_000): Promise<string> {
  const process = Bun.spawn(["agent-browser", "--namespace", "sourced-e2e", "--session", session, "--ignore-https-errors", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => process.kill(), timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  clearTimeout(timer);
  if (exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
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

async function state(): Promise<BrowserState> {
  const value = await evaluate<BrowserState>(`JSON.stringify((() => {
    const confirm = document.querySelector('[data-testid="confirm-packet"]');
    const composer = document.querySelector('[data-testid="composer-input"]');
    const pipeline = document.querySelector('[data-pipeline-stage]');
    const medicationInputs = [...document.querySelectorAll('[data-testid="packet-medication"]')];
    const medications = medicationInputs.map((node) => node.value);
    const medicationStatuses = [...document.querySelectorAll('[data-testid="packet-medication-status"]')];
    const activeMedications = medicationInputs.flatMap((node, index) => {
      const status = medicationStatuses[index];
      return status instanceof HTMLSelectElement && status.value.toLowerCase() === 'active' ? [node.value] : [];
    });
    return {
      url: window.location.href,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      body: document.body.innerText,
      error: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
      meds: medications,
      activeMeds: activeMedications,
      medicationStatuses: medicationStatuses.map((node) => node instanceof HTMLSelectElement ? node.value : ''),
      medicationStatusCount: medicationStatuses.filter((node) => node instanceof HTMLSelectElement).length,
      activeAmbiguityId: document.querySelector('[data-ambiguity-id]')?.getAttribute('data-ambiguity-id') ?? '',
      activeAmbiguityQuestion: document.querySelector('[data-ambiguity-question]')?.getAttribute('data-ambiguity-question') ?? '',
      confirmEnabled: confirm instanceof HTMLButtonElement && !confirm.disabled,
      composerEnabled: composer instanceof HTMLTextAreaElement && !composer.disabled,
      phase: document.querySelector('[data-testid="review-progress"] [aria-current="step"]')?.textContent?.trim() ?? '',
      pipelineStage: pipeline?.getAttribute('data-pipeline-stage') ?? '',
      pipelineStatus: pipeline?.getAttribute('data-pipeline-status') ?? '',
      pipelineHistory: (pipeline?.getAttribute('data-pipeline-history') ?? '').split(',').filter(Boolean),
      verified: Boolean(document.querySelector('[data-testid="verified-review"]')),
      researchCount: document.querySelectorAll('#research-queue li').length,
      overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      citationCount: document.querySelectorAll('[data-testid="evidence-citation"]').length,
      reportFindingCount: (() => {
        const value = document.querySelector('[data-report-finding-count]')?.getAttribute('data-report-finding-count');
        if (value === null || value === undefined || value.trim() === '') return null;
        const count = Number(value);
        return Number.isInteger(count) && count >= 0 ? count : null;
      })(),
      findings: [...document.querySelectorAll('[data-finding-drugs]')].map((node) => {
        const drugsValue = node.getAttribute('data-finding-drugs');
        const citationsValue = node.getAttribute('data-finding-citations');
        let drugs = null;
        try {
          const parsed = JSON.parse(drugsValue ?? '');
          if (Array.isArray(parsed) && parsed.every((drug) => typeof drug === 'string')) drugs = parsed;
        } catch {}
        const citationCount = citationsValue === null || citationsValue.trim() === '' ? null : Number(citationsValue);
        return {
          drugs,
          citationCount: Number.isInteger(citationCount) && citationCount >= 0 ? citationCount : null,
          renderedCitationCount: node.querySelectorAll('[data-testid="evidence-citation"]').length,
        };
      }),
      rejections: [...document.querySelectorAll('#verification-status li')].map((node) => {
        const paragraphs = node.querySelectorAll('p');
        return {
          claim: paragraphs[0]?.textContent?.trim() ?? '',
          reason: paragraphs[1]?.textContent?.trim() ?? '',
        };
      }),
    };
  })())`);
  if (new URL(value.url).origin !== expectedOrigin) {
    throw new Error(`Browser session lost the application origin: ${value.url || "unknown URL"}`);
  }
  latestBrowserState = value;
  return value;
}

async function waitUntil(check: (value: BrowserState) => boolean, timeoutMs: number, label: string): Promise<BrowserState> {
  const started = Date.now();
  let latest = await state();
  while (Date.now() - started < timeoutMs) {
    if (latest.error) throw new Error(`${label}: ${latest.error}`);
    if (check(latest)) return latest;
    await Bun.sleep(500);
    latest = await state();
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms: ${JSON.stringify(latest)}`);
}

async function auditBrowser(
  expectedEndpoints: string[] = [],
  forbiddenEndpoints: string[] = [],
): Promise<{ console: string; errors: string; requests: string }> {
  const [consoleOutput, errors, requests] = await Promise.all([
    browser(["console"]),
    browser(["errors"]),
    browser(["network", "requests"]),
  ]);
  if (/^\[error\]/m.test(consoleOutput)) throw new Error(`Console error: ${consoleOutput}`);
  if (errors && !/no page errors/i.test(errors)) throw new Error(`Page errors: ${errors}`);
  if (/\s5\d\d(?:\s|$)/m.test(requests)) throw new Error(`HTTP 5xx request: ${requests}`);
  for (const endpoint of expectedEndpoints) {
    const request = requests.split("\n").find((line) => line.includes(endpoint));
    if (!request) throw new Error(`Expected browser request was not observed: ${endpoint}`);
    const status = Number(request.match(/\s(\d{3})\s*$/)?.[1]);
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
      throw new Error(`Expected successful browser request for ${endpoint}: ${request}`);
    }
  }
  for (const endpoint of forbiddenEndpoints) {
    if (requests.split("\n").some((line) => line.includes(endpoint))) {
      throw new Error(`Offline showcase must not call ${endpoint}, but a request was observed.`);
    }
  }
  return { console: consoleOutput, errors, requests };
}

function failureState(): Record<string, unknown> | null {
  const latest = latestBrowserState;
  if (!latest) return null;
  return {
    phase: latest.phase,
    url: latest.url,
    medications: latest.meds,
    activeMedications: latest.activeMeds,
    medicationStatuses: latest.medicationStatuses,
    medicationStatusCount: latest.medicationStatusCount,
    activeAmbiguityId: latest.activeAmbiguityId,
    activeAmbiguityQuestion: latest.activeAmbiguityQuestion,
    pipelineHistory: latest.pipelineHistory,
    findings: latest.findings,
    reportFindingCount: latest.reportFindingCount,
    rejections: latest.rejections,
  };
}

async function run(): Promise<void> {
  await record("run_started", {
    expectedMedications: selected.expected_medications,
    expectedActiveMedications,
    forbiddenActiveMedications,
    expectedSurvivingPairs,
    forbiddenPairs,
  });
  await browser(["open", baseUrl]);
  await browser(["set", "viewport", "1440", "1024"]);
  if (locale === "es") {
    await evaluate(`localStorage.setItem("sourced-locale", "es")`);
    await browser(["reload"]);
  }

  const identity = await evaluate<{ title: string; branding: boolean; overlay: boolean; galleryCount: number; overflow: number }>(`JSON.stringify({
    title: document.title,
    branding: /Powered by Eve\\.dev|Streaming UI by json-render|Eve\\.dev/i.test(document.body.innerText),
    overlay: /Unhandled Runtime Error|Application error: a client-side exception|Next\\.js.*error/i.test(document.body.innerText),
    galleryCount: document.querySelectorAll('[data-testid^="load-case-"]').length,
    overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  })`);
  if (identity.title !== "Sourced — Medication Safety Review") throw new Error(`Unexpected title: ${identity.title}`);
  if (identity.branding) throw new Error("Visible implementation branding remains");
  if (identity.overlay) throw new Error("Framework error overlay is visible");
  if (identity.overflow > 0) throw new Error(`Document overflow at empty state: ${identity.overflow}px`);

  await browser(["find", "testid", "published-cases-trigger", "click"]);
  const galleryCount = Number(await browser(["get", "count", "[data-testid^=\"load-case-\"]"]));
  if (galleryCount !== manifest.cases.length) throw new Error(`Gallery count ${galleryCount} does not match corpus ${manifest.cases.length}`);
  const publicCase = webCaseMap.get(selected.id);
  if (!publicCase) throw new Error(`Missing web case: ${selected.id}`);
  const pdf = await evaluate<{ status: number; magic: string }>(`fetch(${JSON.stringify(publicCase.pdf_url)}).then(async (response) => {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return JSON.stringify({ status: response.status, magic: String.fromCharCode(...bytes.slice(0, 5)) });
  })`);
  if (pdf.status !== 200 || pdf.magic !== "%PDF-") throw new Error(`Invalid published PDF: ${JSON.stringify(pdf)}`);
  const smokeAudit = await auditBrowser();
  await record("smoke_passed", { identity, galleryCount, pdf, audit: smokeAudit });
  if (mode === "smoke") return;

  await browser(["find", "testid", `load-case-${selected.id}`, "click"]);
  const intake = await waitUntil((value) => value.meds.length > 0 && (value.composerEnabled || value.confirmEnabled), 120_000, "Published PDF intake");
  if (intake.medicationStatusCount !== intake.meds.length) {
    throw new Error(`Medication status controls ${intake.medicationStatusCount} do not match extracted medications ${intake.meds.length}`);
  }
  const expectedMedications = requiredArray(selected.expected_medications, "expected_medications");
  const normalizedMeds = intake.meds.join(" ").toLowerCase();
  const missingExtracted = expectedMedications.filter(
    (medication) => !normalizedMeds.includes(medication.toLowerCase()),
  );
  if (missingExtracted.length > 0) {
    throw new Error(`Missing expected extracted medications: ${missingExtracted.join(", ")}. Extracted: ${intake.meds.join(" | ")}`);
  }
  assertClinicalOracles({
    activeMedications: intake.activeMeds,
    expectedActiveMedications,
    forbiddenActiveMedications,
    expectedSurvivingPairs: [],
    forbiddenPairs: [],
    findings: [],
    reportFindingCount: 0,
  });
  if (intake.overflow > 0) throw new Error(`Document overflow after intake: ${intake.overflow}px`);
  if (selected.pmcid === "PMC6489390" && intake.activeAmbiguityId !== "source-scope") throw new Error("Multi-patient source did not expose the source-scope clarification");
  const intakeAudit = await auditBrowser([`/data/reviews/${selected.id}.`], ["/api/intake"]);
  await record("intake_passed", {
    medications: intake.meds,
    activeMedications: intake.activeMeds,
    heading: intake.heading,
    audit: intakeAudit,
  });
  if (mode === "intake") return;

  let clarifications = 0;
  let current = intake;
  while (!current.confirmEnabled) {
    if (!current.composerEnabled) current = await waitUntil((value) => value.composerEnabled || value.confirmEnabled, 90_000, "Clarification readiness");
    if (current.confirmEnabled) break;
    if (clarifications >= 12) throw new Error("More than 12 clarifications were required");
    const ambiguityText = `${current.activeAmbiguityId} ${current.activeAmbiguityQuestion}`.toLowerCase();
    const configuredAnswer = selected.clarification_answers?.find((item) =>
      ambiguityText.includes(item.match.toLowerCase())
    )?.answer;
    if (configuredAnswer) {
      await browser(["find", "testid", "composer-input", "fill", configuredAnswer]);
      await browser(["find", "testid", "composer-continue", "click"]);
    } else {
      await browser(["find", "testid", "keep-unknown", "click"]);
    }
    clarifications += 1;
    current = await waitUntil((value) => value.confirmEnabled || value.composerEnabled, 90_000, `Clarification ${clarifications}`);
    if (current.composerEnabled && !current.confirmEnabled) await Bun.sleep(750);
    current = await state();
  }

  await browser(["find", "testid", "confirm-packet", "click"]);
  const review = await waitUntil((value) => value.verified, 360_000, "Verified review");
  const requiredStages = ["ingest", "retrieve", "synthesize", "verify"];
  const missingStages = requiredStages.filter((stage) => !review.pipelineHistory.includes(stage));
  if (missingStages.length > 0) throw new Error(`Missing streamed pipeline stages: ${missingStages.join(", ")}`);
  if (!/All claims traced to source|claims? removed by the verifier|Todas las afirmaciones están vinculadas a una fuente|afirmaciones? eliminadas?|verificador eliminó \d+ afirmaci/i.test(review.body)) throw new Error("Reviewer publication state is not rendered");
  const clinicalOracle = assertClinicalOracles({
    activeMedications: review.activeMeds.length > 0 ? review.activeMeds : intake.activeMeds,
    expectedActiveMedications,
    forbiddenActiveMedications,
    expectedSurvivingPairs,
    forbiddenPairs,
    findings: review.findings,
    reportFindingCount: review.reportFindingCount,
  });
  if (review.overflow > 0) throw new Error(`Document overflow after review: ${review.overflow}px`);
  // The research queue must render exactly the routed candidates the offline
  // review carries, so the "routed to research" beat is real, not decorative.
  const expectedReview = await Bun.file(join(root, "web", "public", "data", "reviews", `${selected.id}.en.json`)).json() as { report: { research_candidates?: unknown[] } };
  const expectedResearch = expectedReview.report.research_candidates?.length ?? 0;
  if (review.researchCount !== expectedResearch) {
    throw new Error(`Research queue rendered ${review.researchCount} candidates, expected ${expectedResearch}`);
  }
  const audit = await auditBrowser([`/data/reviews/${selected.id}.`], ["/api/intake", "/api/review-ui"]);
  let screenshot = "";
  let screenshotError = "";
  if (process.env.E2E_SCREENSHOTS === "1") {
    try {
      screenshot = join(artifactDir, `${runId}.png`);
      await browser(["screenshot", screenshot], 15_000);
    } catch (error) {
      screenshot = "";
      screenshotError = error instanceof Error ? error.message : String(error);
    }
  }
  await record("full_review_passed", {
    clarifications,
    pipelineHistory: review.pipelineHistory,
    findingCount: clinicalOracle.reportFindingCount,
    findings: clinicalOracle.findings,
    expectedSurvivingPairs,
    forbiddenPairs,
    citationCount: review.citationCount,
    requests: audit.requests,
    screenshot,
    screenshotError,
  });
}

try {
  await run();
  await record("run_passed");
  console.log(JSON.stringify({ ok: true, runId, session, soakId, codeFingerprint: runCodeFingerprint, caseId, mode }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  let screenshot = "";
  if (process.env.E2E_SCREENSHOTS === "1") {
    try {
      screenshot = join(artifactDir, `${runId}-failure.png`);
      await browser(["screenshot", screenshot], 15_000);
    } catch {}
  }
  await record("run_failed", {
    error: message,
    screenshot,
    state: failureState(),
  });
  console.error(JSON.stringify({ ok: false, runId, session, caseId, mode, error: message }));
  process.exitCode = 1;
} finally {
  if (!keepOpen) {
    try {
      await browser(["close"]);
    } catch {}
  }
}
