import { ingest } from "./ingest/index.ts";
import { retrieve } from "./retrieve/index.ts";
import { synthesize } from "./synthesize/index.ts";
import { verify } from "./verify/index.ts";
import type { EvidenceObject, Finding, SafetyReport } from "./types/index.ts";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface AuditEntry {
  finding: Finding;
  evidence: (EvidenceObject & { query: string; timestamp: string })[];
}

interface AuditLedger {
  generated_at: string;
  findings: AuditEntry[];
  unverified_removed: SafetyReport["unverified_removed"];
  report: SafetyReport;
}

function buildAuditLedger(report: SafetyReport): AuditLedger {
  const evidenceById = new Map(report.evidence.map((item) => [item.id, item]));
  return {
    generated_at: report.generated_at,
    findings: report.findings.map((finding) => ({
      finding,
      evidence: finding.evidence_ids.map((id) => {
        const item = evidenceById.get(id);
        if (!item) {
          throw new Error(`audit: verified finding referenced missing evidence_id ${id}`);
        }
        return {
          ...item,
          query: item.retrieval_query,
          timestamp: item.retrieved_at,
        };
      }),
    })),
    unverified_removed: report.unverified_removed,
    report,
  };
}

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
  const ddinterCsvPath = resolve(repoRoot, "data/sources/ddinter_B.csv");
  const outDir = resolve(repoRoot, "out");
  const outPath = resolve(outDir, "report.json");
  const webReportPath = resolve(repoRoot, "web/public/data/report.json");
  const now = process.env.SOURCED_NOW ?? new Date().toISOString();
  const raw = await file.json();
  const context = await ingest(raw);
  const unresolved = context.medications.filter((m) => m.resolution === "unresolved");
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} medication(s) unresolved:`);
    for (const med of unresolved) {
      console.error(`  - "${med.raw}"`);
    }
  }

  const retrieval = await retrieve(context, ddinterCsvPath, now);

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasCli = Bun.which("claude") !== null;
  if (!hasKey && !hasCli) {
    console.error("\nThe synthesize/verify steps need Claude Opus 4.8. Set ANTHROPIC_API_KEY,");
    console.error("or install the `claude` CLI and log in. To see the pre-generated result");
    console.error("without credentials, run: bun run demo:cached\n");
    process.exit(1);
  }

  const draftReport = await synthesize(context, retrieval.evidence, now);
  const report = await verify(draftReport, retrieval.evidence, { patient: context });
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
