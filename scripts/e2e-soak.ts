import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codeFingerprint, inclusiveSchedule } from "./e2e-oracles";
import { resourceLimitsSatisfied, resourceSnapshot } from "./resource-health";

interface SoakEvent {
  at: string;
  soakId: string;
  codeFingerprint: string;
  type: string;
  [key: string]: unknown;
}

interface PublishedCase {
  id: string;
  qualification_mode?: "full" | "intake";
}

type Mode = "smoke" | "intake" | "full";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const artifactDir = join(root, "validation", "e2e");
const eventPath = join(artifactDir, "soak-events.jsonl");
const statePath = join(artifactDir, "soak-state.json");
const manifest = await Bun.file(join(root, "data", "case-reports", "manifest.json")).json() as { cases: PublishedCase[] };

function numberArgument(name: string, fallback: number): number {
  const index = Bun.argv.indexOf(name);
  const value = index >= 0 ? Number(Bun.argv[index + 1]) : fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

const durationMs = Bun.argv.includes("--duration-minutes")
  ? numberArgument("--duration-minutes", 480) * 60_000
  : numberArgument("--duration-hours", 8) * 3_600_000;
const smokeEveryMs = numberArgument("--smoke-every-seconds", 600) * 1_000;
const intakeEveryMs = numberArgument("--intake-every-seconds", 1_800) * 1_000;
const fullEveryMs = numberArgument("--full-every-seconds", 3_600) * 1_000;
const heartbeatEveryMs = numberArgument("--heartbeat-every-seconds", 60) * 1_000;
const childTimeoutOverrideMs = Bun.argv.includes("--child-timeout-seconds")
  ? numberArgument("--child-timeout-seconds", 600) * 1_000
  : null;
const dryRun = Bun.argv.includes("--dry-run");
const startedAt = new Date();
const endsAt = new Date(startedAt.getTime() + durationMs);
const soakId = startedAt.toISOString().replaceAll(":", "-");
const soakCodeFingerprint = await codeFingerprint(root);
const fullQualificationCases = manifest.cases.filter((item) => (item.qualification_mode ?? "full") === "full");
const modeIndexes: Record<Mode, number> = { smoke: 0, intake: 0, full: 0 };
const passedFullCases = new Set<string>();
let failures = 0;
let checks = 0;
let interrupted = false;
let invalidated = false;
let heartbeatStopped = false;
let activeChild: Bun.ReadableSubprocess | null = null;
let eventQueue = Promise.resolve();
let stateQueue = Promise.resolve();

if (manifest.cases.length === 0) throw new Error("Published case corpus is empty");
if (fullQualificationCases.length === 0 && !dryRun) throw new Error("No cases are qualified for full review");

await mkdir(artifactDir, { recursive: true });

async function event(type: string, data: Record<string, unknown> = {}): Promise<void> {
  const payload: SoakEvent = {
    at: new Date().toISOString(),
    soakId,
    codeFingerprint: soakCodeFingerprint,
    type,
    ...data,
  };
  eventQueue = eventQueue.then(async () => {
    await appendFile(eventPath, `${JSON.stringify(payload)}\n`);
    console.log(JSON.stringify(payload));
  });
  await eventQueue;
}

async function persist(status: string): Promise<void> {
  const payload = `${JSON.stringify({
    soakId,
    codeFingerprint: soakCodeFingerprint,
    pid: process.pid,
    status,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    updatedAt: new Date().toISOString(),
    elapsedSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1_000),
    checks,
    failures,
    passedFullCases: [...passedFullCases],
  }, null, 2)}\n`;
  stateQueue = stateQueue.then(() => writeFile(statePath, payload));
  await stateQueue;
}

function casesForMode(mode: Mode): PublishedCase[] {
  return mode === "full" ? fullQualificationCases : manifest.cases;
}

function timeoutForMode(mode: Mode): number {
  if (childTimeoutOverrideMs) return childTimeoutOverrideMs;
  if (mode === "smoke") return 150_000;
  if (mode === "intake") return 240_000;
  return 600_000;
}

async function collectChild(
  child: Bun.ReadableSubprocess,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  let timedOut = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const exited = child.exited.then((exitCode) => ({ kind: "exit" as const, exitCode }));
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    deadline = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const result = await Promise.race([exited, timeout]);
  let exitCode: number;
  if (result.kind === "timeout") {
    timedOut = true;
    child.kill();
    const terminated = await Promise.race([
      child.exited.then((code) => ({ exited: true as const, code })),
      Bun.sleep(5_000).then(() => ({ exited: false as const, code: 124 })),
    ]);
    if (!terminated.exited) child.kill(9);
    exitCode = terminated.exited ? terminated.code : await child.exited;
  } else {
    exitCode = result.exitCode;
  }
  if (deadline) clearTimeout(deadline);
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode: timedOut ? 124 : exitCode, stdout, stderr, timedOut };
}

async function verifyFingerprint(): Promise<boolean> {
  const current = await codeFingerprint(root);
  if (current === soakCodeFingerprint) return true;
  invalidated = true;
  failures += 1;
  await event("code_fingerprint_changed", { expected: soakCodeFingerprint, received: current });
  await persist("invalidated");
  return false;
}

async function verifyResources(): Promise<boolean> {
  const resources = await resourceSnapshot();
  if (resourceLimitsSatisfied(resources)) return true;
  invalidated = true;
  failures += 1;
  activeChild?.kill();
  await event("resource_limit_reached", { resources });
  await persist("invalidated");
  return false;
}

async function runCheck(mode: Mode, scheduledAt: number): Promise<void> {
  if (!await verifyFingerprint()) return;
  if (!await verifyResources()) return;
  const cases = casesForMode(mode);
  const item = cases[modeIndexes[mode] % cases.length];
  if (!item) throw new Error(`No published cases are available for ${mode}`);
  modeIndexes[mode] += 1;
  const timeoutMs = timeoutForMode(mode);
  await event("check_started", {
    mode,
    caseId: item.id,
    scheduledAt: new Date(scheduledAt).toISOString(),
    deadlineAt: new Date(Date.now() + timeoutMs).toISOString(),
    scheduleLagMs: Math.max(0, Date.now() - scheduledAt),
  });
  const child = Bun.spawn([
    "bun",
    "run",
    "scripts/e2e-browser.ts",
    "--mode",
    mode,
    "--case",
    item.id,
    "--soak-id",
    soakId,
    "--code-fingerprint",
    soakCodeFingerprint,
  ], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  activeChild = child;
  const result = await collectChild(child, timeoutMs);
  activeChild = null;
  checks += 1;
  const fingerprintMatches = await verifyFingerprint();
  const passed = result.exitCode === 0 && !result.timedOut && fingerprintMatches;
  if (!passed && fingerprintMatches) failures += 1;
  if (passed && mode === "full") passedFullCases.add(item.id);
  await event(passed ? "check_passed" : "check_failed", {
    mode,
    caseId: item.id,
    scheduledAt: new Date(scheduledAt).toISOString(),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    output: `${result.stdout}${result.stderr}`.trim().slice(-4_000),
  });
  await persist(invalidated ? "invalidated" : "running");
}

async function heartbeatLoop(): Promise<void> {
  let scheduledAt = startedAt.getTime() + heartbeatEveryMs;
  while (!heartbeatStopped && scheduledAt <= endsAt.getTime()) {
    const waitMs = scheduledAt - Date.now();
    if (waitMs > 0) await Bun.sleep(Math.min(waitMs, 1_000));
    if (heartbeatStopped) return;
    if (invalidated) return;
    if (Date.now() < scheduledAt) continue;
    const resources = await resourceSnapshot();
    if (!resourceLimitsSatisfied(resources)) {
      invalidated = true;
      failures += 1;
      activeChild?.kill();
      await event("resource_limit_reached", { resources });
      await persist("invalidated");
      return;
    }
    await event("heartbeat", {
      scheduledAt: new Date(scheduledAt).toISOString(),
      scheduleLagMs: Math.max(0, Date.now() - scheduledAt),
      elapsedSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1_000),
      checks,
      failures,
      activeCheck: Boolean(activeChild),
      resources,
    });
    await persist(invalidated ? "invalidated" : "running");
    scheduledAt += heartbeatEveryMs;
  }
}

process.on("SIGINT", () => {
  interrupted = true;
  activeChild?.kill();
});
process.on("SIGTERM", () => {
  interrupted = true;
  activeChild?.kill();
});

await event("soak_started", {
  pid: process.pid,
  startedAt: startedAt.toISOString(),
  endsAt: endsAt.toISOString(),
  durationSeconds: Math.floor(durationMs / 1_000),
  scheduleSeconds: {
    smoke: smokeEveryMs / 1_000,
    intake: intakeEveryMs / 1_000,
    full: fullEveryMs / 1_000,
    heartbeat: heartbeatEveryMs / 1_000,
  },
  childTimeoutSeconds: {
    smoke: timeoutForMode("smoke") / 1_000,
    intake: timeoutForMode("intake") / 1_000,
    full: timeoutForMode("full") / 1_000,
  },
  fullQualificationCases: fullQualificationCases.map((item) => item.id),
  dryRun,
  resources: await resourceSnapshot(),
});
await persist("running");

const heartbeatTask = heartbeatLoop();
const schedule: Record<Mode, { times: number[]; index: number }> = {
  smoke: {
    times: inclusiveSchedule(startedAt.getTime(), endsAt.getTime(), smokeEveryMs),
    index: 0,
  },
  intake: {
    times: inclusiveSchedule(startedAt.getTime(), endsAt.getTime(), intakeEveryMs, intakeEveryMs),
    index: 0,
  },
  full: {
    times: inclusiveSchedule(startedAt.getTime(), endsAt.getTime(), fullEveryMs, fullEveryMs),
    index: 0,
  },
};

while (!interrupted && !invalidated) {
  const due = (Object.entries(schedule) as Array<[Mode, { times: number[]; index: number }]>)
    .flatMap(([mode, item]) => {
      const time = item.times[item.index];
      return time !== undefined && time <= Date.now() ? [{ mode, item, time }] : [];
    })
    .sort((left, right) => left.time - right.time)[0];
  if (due) {
    due.item.index += 1;
    await runCheck(due.mode, due.time);
    continue;
  }
  const pending = Object.values(schedule)
    .flatMap((item) => item.times[item.index] ?? []);
  if (pending.length === 0 || Date.now() >= endsAt.getTime()) break;
  await Bun.sleep(Math.min(1_000, Math.max(50, Math.min(...pending, endsAt.getTime()) - Date.now())));
}

heartbeatStopped = true;
await heartbeatTask;
const elapsedMs = Date.now() - startedAt.getTime();
const missingCases = fullQualificationCases
  .map((item) => item.id)
  .filter((id) => !passedFullCases.has(id));
const passed = !interrupted
  && !invalidated
  && elapsedMs >= durationMs
  && failures === 0
  && (dryRun || missingCases.length === 0);
const finalType = invalidated ? "soak_invalidated" : interrupted ? "soak_interrupted" : "soak_completed";
await event(finalType, {
  passed,
  elapsedSeconds: Math.floor(elapsedMs / 1_000),
  checks,
  failures,
  fullCases: [...passedFullCases],
  missingCases,
});
await persist(passed ? "passed" : invalidated ? "invalidated" : interrupted ? "interrupted" : "failed");
if (!passed) process.exitCode = 1;
