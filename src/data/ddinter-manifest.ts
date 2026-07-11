import { basename, join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import {
  loadDdinter,
  normalizeDrugKey,
  type DdinterCoverage,
  type DdinterDataset,
} from "../retrieve/ddinter.ts";

export interface DdinterManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface DdinterManifest {
  dataset: string;
  release: string;
  source_url: string;
  terms_url: string;
  license: string;
  retrieved_at: string;
  transport_note: string;
  files: DdinterManifestFile[];
  coverage: DdinterCoverage;
}

export function ddinterDrugNames(dataset: DdinterDataset): string[] {
  const namesByKey = new Map<string, string>();
  for (const row of dataset.byPair.values()) {
    for (const name of [row.drugA, row.drugB]) {
      const key = normalizeDrugKey(name);
      if (!namesByKey.has(key)) namesByKey.set(key, name.trim());
    }
  }
  return [...namesByKey.values()].sort((left, right) => left.localeCompare(right));
}

async function sha256(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer();
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

export async function buildDdinterManifest(
  sourceDir: string,
  retrievedAt: string,
): Promise<DdinterManifest> {
  const names = (await readdir(sourceDir)).filter((name) => name.endsWith(".csv")).sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const path = join(sourceDir, name);
      const file = Bun.file(path);
      return { name, bytes: file.size, sha256: await sha256(path) };
    }),
  );
  const dataset = await loadDdinter(sourceDir);
  return {
    dataset: "DDInter drug-drug interaction database",
    release: "v1 public ATC download bundle",
    source_url: "https://ddinter.scbdd.com/download/",
    terms_url: "https://ddinter.scbdd.com/terms/",
    license: "CC BY-NC-SA 4.0",
    retrieved_at: retrievedAt,
    transport_note:
      "The official host certificate was expired at retrieval. Files were downloaded directly from the official host and pinned here by SHA-256.",
    files,
    coverage: dataset.coverage,
  };
}

export async function verifyDdinterManifest(repoRoot: string): Promise<DdinterManifest> {
  const sourceDir = resolve(repoRoot, "data/sources/ddinter");
  const manifestPath = join(sourceDir, "manifest.json");
  const manifest = (await Bun.file(manifestPath).json()) as DdinterManifest;
  const computed = await buildDdinterManifest(sourceDir, manifest.retrieved_at);
  if (JSON.stringify(computed) !== JSON.stringify(manifest)) {
    throw new Error("DDInter manifest does not match the bundled source files");
  }
  return manifest;
}

export function formatCoverage(manifest: DdinterManifest): string {
  return JSON.stringify(
    {
      dataset: manifest.dataset,
      release: manifest.release,
      license: manifest.license,
      retrieved_at: manifest.retrieved_at,
      source_files: manifest.coverage.files.length,
      source_rows: manifest.coverage.rawRows,
      unique_pairs: manifest.coverage.uniquePairs,
      unique_drugs: manifest.coverage.uniqueDrugs,
      severities: manifest.coverage.severities,
      integrity: "verified",
    },
    null,
    2,
  );
}
