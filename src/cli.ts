import { buildAuditLedger, runVerifiedReview } from "./review.ts";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function main(): Promise<void> {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error("Usage: bun run src/cli.ts <fixture.json>");
    process.exit(1);
  }

  const file = Bun.file(fixturePath);
  if (!(await file.exists())) {
    console.error(`cli: file not found: ${fixturePath}`);
    process.exit(1);
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = resolve(repoRoot, "out");
  const outPath = resolve(outDir, "report.json");
  const webReportPath = resolve(repoRoot, "web/public/data/report.json");
  const now = process.env.SOURCED_NOW ?? new Date().toISOString();
  const raw = await file.json();

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasCli = Bun.which("claude") !== null;
  if (!hasKey && !hasCli) {
    console.error("\nThe synthesize/verify steps need Claude Opus 4.8. Set ANTHROPIC_API_KEY,");
    console.error("or install the `claude` CLI and log in. To see the pre-generated result");
    console.error("without credentials, run: bun run demo:cached\n");
    process.exit(1);
  }

  const report = await runVerifiedReview(raw, { now });
  const unresolved = report.patient?.medications.filter((medication) => !medication.rxcui) ?? [];
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} medication(s) unresolved:`);
    for (const medication of unresolved) console.error(`  - "${medication.raw}"`);
  }
  const auditLedger = buildAuditLedger(report);

  await mkdir(outDir, { recursive: true });
  await Bun.write(outPath, `${JSON.stringify(auditLedger, null, 2)}\n`);
  await Bun.write(webReportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("cli failed:", error);
  process.exit(1);
});
