import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codeFingerprint } from "./e2e-oracles";
import { resourceLimitsSatisfied, resourceSnapshot } from "./resource-health";

interface EventRecord {
  at?: string;
  type?: string;
  caseId?: string;
  mode?: string;
  codeFingerprint?: string;
  passed?: boolean;
  elapsedSeconds?: number;
  failures?: number;
  fullCases?: string[];
}

interface ManifestCase {
  id: string;
  pmcid: string;
  license: string;
  qualification_mode?: "full" | "intake";
}

interface BuildCase {
  id: string;
  pdf: string;
  license_evidence: string;
  pdf_sha256: string;
  license_sha256: string;
}

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const validationDir = join(root, "validation", "e2e");
const fingerprint = await codeFingerprint(root);
const failures: string[] = [];
const manifest = await Bun.file(join(root, "data", "case-reports", "manifest.json")).json() as { cases: ManifestCase[] };
const build = await Bun.file(join(root, "data", "case-reports", "build.json")).json() as { cases: BuildCase[] };
const publicCases = await Bun.file(join(root, "web", "public", "data", "published-cases.json")).json() as { cases: Array<{ id: string; pdf_url: string }> };

async function readEvents(path: string): Promise<EventRecord[]> {
  try {
    return (await readFile(path, "utf8")).split("\n").flatMap((line) => {
      if (!line) return [];
      try {
        return [JSON.parse(line) as EventRecord];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

async function digest(file: Blob): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
}

if (manifest.cases.length < 12) failures.push(`Published corpus has ${manifest.cases.length} cases, expected at least 12`);
if (build.cases.length !== manifest.cases.length) failures.push("Build corpus count does not match manifest");
if (publicCases.cases.length !== manifest.cases.length) failures.push("Public gallery count does not match manifest");

for (const item of manifest.cases) {
  const generated = build.cases.find((candidate) => candidate.id === item.id);
  const published = publicCases.cases.find((candidate) => candidate.id === item.id);
  if (!generated || !published) {
    failures.push(`${item.id} is missing from generated or public corpus`);
    continue;
  }
  const sourcePdf = Bun.file(join(root, "data", "case-reports", generated.pdf));
  const publicPdf = Bun.file(join(root, "web", "public", published.pdf_url.replace(/^\//, "")));
  const licenseFile = Bun.file(join(root, "data", "case-reports", generated.license_evidence));
  if (!await sourcePdf.exists() || !await publicPdf.exists() || !await licenseFile.exists()) {
    failures.push(`${item.id} is missing a PDF or license artifact`);
    continue;
  }
  if (await digest(sourcePdf) !== generated.pdf_sha256 || await digest(publicPdf) !== generated.pdf_sha256) {
    failures.push(`${item.id} PDF digest mismatch`);
  }
  const licenseText = await licenseFile.text();
  if (
    new Bun.CryptoHasher("sha256").update(licenseText).digest("hex") !== generated.license_sha256 ||
    !licenseText.includes(`id="${item.pmcid}"`) ||
    !licenseText.includes(`license="${item.license}"`)
  ) {
    failures.push(`${item.id} license evidence mismatch`);
  }
}

const browserEvents = await readEvents(join(validationDir, "browser-events.jsonl"));
const currentBrowserEvents = browserEvents.filter((event) => event.codeFingerprint === fingerprint);
const qualifyingCases = manifest.cases.filter((item) => (item.qualification_mode ?? "full") === "full");
for (const item of qualifyingCases) {
  if (!currentBrowserEvents.some((event) => event.type === "full_review_passed" && event.caseId === item.id)) {
    failures.push(`${item.id} has no exact full-review pass for the current fingerprint`);
  }
}
if (!currentBrowserEvents.some((event) => event.type === "edge_run_passed" && event.mode === "edges")) {
  failures.push("Edge E2E has no pass for the current fingerprint");
}

const soakEvents = await readEvents(join(validationDir, "soak-events.jsonl"));
const completedSoak = soakEvents
  .filter((event) => event.type === "soak_completed" && event.codeFingerprint === fingerprint)
  .at(-1);
if (
  !completedSoak ||
  completedSoak.passed !== true ||
  (completedSoak.elapsedSeconds ?? 0) < 28_800 ||
  completedSoak.failures !== 0
) {
  failures.push("No passing eight-hour soak exists for the current fingerprint");
} else {
  const fullCases = new Set(completedSoak.fullCases ?? []);
  const missing = qualifyingCases.filter((item) => !fullCases.has(item.id));
  if (missing.length > 0) failures.push(`Soak missed full cases: ${missing.map((item) => item.id).join(", ")}`);
}

const resources = await resourceSnapshot();
if (!resourceLimitsSatisfied(resources)) failures.push("Resource health gate failed");

const result = {
  auditedAt: new Date().toISOString(),
  passed: failures.length === 0,
  codeFingerprint: fingerprint,
  corpusCases: manifest.cases.length,
  qualifyingCases: qualifyingCases.map((item) => item.id),
  currentBrowserEvents: currentBrowserEvents.length,
  soak: completedSoak ?? null,
  resources,
  failures,
};
await writeFile(join(validationDir, "final-audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
