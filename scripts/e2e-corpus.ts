import { readFile } from "node:fs/promises";
import { codeFingerprint } from "./e2e-oracles";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const manifest = await Bun.file(`${root}/data/case-reports/manifest.json`).json() as {
  cases: Array<{ id: string; qualification_mode?: "full" | "intake" }>;
};
const intakeOnly = Bun.argv.includes("--intake-only");
const currentCodeFingerprint = await codeFingerprint(root);
const results: Array<{ id: string; mode: "full" | "intake"; ok: boolean; output: string }> = [];
const completed = new Set<string>();

if (Bun.argv.includes("--resume") && !intakeOnly) {
  try {
    for (const line of (await readFile(`${root}/validation/e2e/browser-events.jsonl`, "utf8")).split("\n")) {
      if (!line) continue;
      const event = JSON.parse(line) as { type?: string; caseId?: string; codeFingerprint?: string };
      if (
        event.type === "full_review_passed"
        && event.caseId
        && event.codeFingerprint === currentCodeFingerprint
      ) completed.add(event.caseId);
    }
  } catch {}
}

for (const item of manifest.cases) {
  const mode = intakeOnly ? "intake" : item.qualification_mode ?? "full";
  if (mode === "full" && completed.has(item.id)) {
    results.push({ id: item.id, mode, ok: true, output: JSON.stringify({ ok: true, caseId: item.id, mode, resumed: true }) });
    console.log(results.at(-1)?.output);
    continue;
  }
  const child = Bun.spawn(["bun", "run", "scripts/e2e-browser.ts", "--mode", mode, "--case", item.id], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, mode === "full" ? 600_000 : 240_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  const output = `${stdout}${stderr}${timedOut ? `\nTimed out in ${mode} mode` : ""}`.trim().slice(-20_000);
  results.push({ id: item.id, mode, ok: exitCode === 0 && !timedOut, output });
  console.log(output);
}

const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  intakeOnly,
  passed: results.length - failed.length,
  full: results.filter((item) => item.mode === "full").length,
  intake: results.filter((item) => item.mode === "intake").length,
  failed: failed.map((item) => item.id),
}));
if (failed.length > 0) process.exitCode = 1;
