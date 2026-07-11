import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ddinterDrugNames, verifyDdinterManifest } from "./ddinter-manifest.ts";
import { loadDdinter } from "../retrieve/ddinter.ts";

test("bundled DDInter corpus matches its coverage and integrity manifest", async () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const manifest = await verifyDdinterManifest(repoRoot);
  expect(manifest.coverage.files).toHaveLength(8);
  expect(manifest.coverage.rawRows).toBeGreaterThan(200_000);
  expect(manifest.coverage.uniquePairs).toBeGreaterThan(100_000);
  expect(manifest.coverage.uniqueDrugs).toBeGreaterThan(1_500);
  const dataset = await loadDdinter(resolve(repoRoot, "data/sources/ddinter"));
  const generatedLexicon = await Bun.file(resolve(repoRoot, "web/lib/data/ddinter-drugs.json")).json();
  expect(generatedLexicon).toEqual(ddinterDrugNames(dataset));
  const sourceAliases = await Bun.file(resolve(repoRoot, "data/sources/rxnorm/intake-aliases.json")).json();
  const generatedAliases = await Bun.file(resolve(repoRoot, "web/lib/data/rxnorm-aliases.json")).json();
  expect(generatedAliases).toEqual(sourceAliases);
  expect(sourceAliases.aliases.every((alias: { term: string; rxcui: string; resolution_url: string }) =>
    alias.term.length >= 2
    && /^\d+$/.test(alias.rxcui)
    && alias.resolution_url.startsWith("https://rxnav.nlm.nih.gov/REST/")
  )).toBe(true);
});
