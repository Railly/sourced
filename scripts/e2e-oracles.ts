import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ClinicalOracleInput {
  activeMedications: string[];
  expectedActiveMedications: string[];
  forbiddenActiveMedications: string[];
  expectedSurvivingPairs: string[][];
  forbiddenPairs: string[][];
  findings: Array<{ drugs: string[] | null; citationCount: number | null; renderedCitationCount: number }>;
  reportFindingCount: number | null;
}

export interface ClinicalOracleResult {
  activeMedications: string[];
  findings: Array<{ drugs: string[]; citationCount: number; renderedCitationCount: number }>;
  reportFindingCount: number;
}

export function normalizeMedication(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function medicationMatches(actual: string, expected: string): boolean {
  const normalizedActual = normalizeMedication(actual);
  const normalizedExpected = normalizeMedication(expected);
  if (normalizedActual === normalizedExpected) return true;
  if (normalizedActual.length < 5 || normalizedExpected.length < 5) return false;
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

function listContainsMedication(actual: string[], expected: string): boolean {
  return actual.some((item) => medicationMatches(item, expected));
}

function findingContainsPair(drugs: string[], pair: string[]): boolean {
  return pair.every((expected) => listContainsMedication(drugs, expected));
}

function pairLabel(pair: string[]): string {
  return pair.join(" + ");
}

export function assertClinicalOracles(input: ClinicalOracleInput): ClinicalOracleResult {
  for (const [field, medications] of [
    ["expectedActiveMedications", input.expectedActiveMedications],
    ["forbiddenActiveMedications", input.forbiddenActiveMedications],
  ] as const) {
    if (medications.some((medication) => typeof medication !== "string" || !medication.trim())) {
      throw new Error(`${field} contains an invalid medication`);
    }
  }
  for (const [field, pairs] of [
    ["expectedSurvivingPairs", input.expectedSurvivingPairs],
    ["forbiddenPairs", input.forbiddenPairs],
  ] as const) {
    if (pairs.some((pair) => pair.length < 2 || pair.some((medication) => typeof medication !== "string" || !medication.trim()))) {
      throw new Error(`${field} contains an invalid pair`);
    }
  }
  if (input.reportFindingCount === null || !Number.isInteger(input.reportFindingCount) || input.reportFindingCount < 0) {
    throw new Error("Verified review is missing a valid data-report-finding-count");
  }
  if (input.findings.length !== input.reportFindingCount) {
    throw new Error(`Rendered finding count ${input.findings.length} does not match report count ${input.reportFindingCount}`);
  }

  const findings = input.findings.map((finding, index) => {
    if (!finding.drugs || !Array.isArray(finding.drugs) || finding.drugs.some((drug) => typeof drug !== "string" || !drug.trim())) {
      throw new Error(`Finding ${index + 1} is missing valid data-finding-drugs JSON`);
    }
    if (finding.citationCount === null || !Number.isInteger(finding.citationCount) || finding.citationCount <= 0) {
      throw new Error(`Finding ${index + 1} has no cited evidence`);
    }
    if (finding.renderedCitationCount !== finding.citationCount) {
      throw new Error(`Finding ${index + 1} rendered ${finding.renderedCitationCount} citations but the report declares ${finding.citationCount}`);
    }
    return {
      drugs: finding.drugs,
      citationCount: finding.citationCount,
      renderedCitationCount: finding.renderedCitationCount,
    };
  });

  const missingActive = input.expectedActiveMedications.filter(
    (medication) => !listContainsMedication(input.activeMedications, medication),
  );
  if (missingActive.length > 0) {
    throw new Error(`Missing expected active medications: ${missingActive.join(", ")}`);
  }

  const forbiddenActive = input.forbiddenActiveMedications.filter(
    (medication) => listContainsMedication(input.activeMedications, medication),
  );
  if (forbiddenActive.length > 0) {
    throw new Error(`Forbidden active medications survived: ${forbiddenActive.join(", ")}`);
  }

  const missingPairs = input.expectedSurvivingPairs.filter(
    (pair) => !findings.some((finding) => findingContainsPair(finding.drugs, pair)),
  );
  if (missingPairs.length > 0) {
    throw new Error(`Expected surviving pairs were not published in a single finding: ${missingPairs.map(pairLabel).join(", ")}`);
  }

  const publishedForbiddenPairs = input.forbiddenPairs.filter(
    (pair) => findings.some((finding) => findingContainsPair(finding.drugs, pair)),
  );
  if (publishedForbiddenPairs.length > 0) {
    throw new Error(`Forbidden pairs were published: ${publishedForbiddenPairs.map(pairLabel).join(", ")}`);
  }

  return {
    activeMedications: input.activeMedications,
    findings,
    reportFindingCount: input.reportFindingCount,
  };
}

const fingerprintRoots = [
  "src",
  "scripts",
  "web/agent",
  "web/app",
  "web/components",
  "web/hooks",
  "web/lib",
];

const fingerprintFiles = [
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "data/case-reports/build.json",
  "data/case-reports/manifest.json",
  "data/sources/ddinter/manifest.json",
  "web/package.json",
  "web/bun.lock",
  "web/next.config.ts",
  "web/tsconfig.json",
  "web/public/data/published-cases.json",
  "web/public/data/ddinter-manifest.json",
];

async function collectFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export function fingerprintEntries(entries: Array<{ path: string; contents: Uint8Array | string }>): string {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function inclusiveSchedule(start: number, end: number, interval: number, offset = 0): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(interval) || !Number.isFinite(offset)) {
    throw new Error("Schedule values must be finite numbers");
  }
  if (interval <= 0 || offset < 0 || end < start) throw new Error("Invalid inclusive schedule bounds");
  const times: number[] = [];
  for (let time = start + offset; time <= end; time += interval) times.push(time);
  return times;
}

export async function codeFingerprint(root: string): Promise<string> {
  const candidates: string[] = [];
  for (const path of fingerprintRoots) {
    const absolute = join(root, path);
    try {
      if ((await stat(absolute)).isDirectory()) candidates.push(...await collectFiles(absolute));
    } catch {}
  }
  for (const path of fingerprintFiles) {
    const absolute = join(root, path);
    try {
      if ((await stat(absolute)).isFile()) candidates.push(absolute);
    } catch {}
  }
  const entries = await Promise.all(
    [...new Set(candidates)].map(async (path) => ({ path: relative(root, path), contents: await readFile(path) })),
  );
  return fingerprintEntries(entries);
}
