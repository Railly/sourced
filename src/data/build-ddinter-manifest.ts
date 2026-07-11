import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { buildDdinterManifest, ddinterDrugNames, formatCoverage } from "./ddinter-manifest.ts";
import { loadDdinter } from "../retrieve/ddinter.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = resolve(repoRoot, "data/sources/ddinter");
const retrievedAt = process.env.SOURCED_DATA_RETRIEVED_AT;
if (!retrievedAt) throw new Error("SOURCED_DATA_RETRIEVED_AT is required");

const manifest = await buildDdinterManifest(sourceDir, retrievedAt);
const dataset = await loadDdinter(sourceDir);
const drugNames = ddinterDrugNames(dataset);
const rxnormAliases = await Bun.file(resolve(repoRoot, "data/sources/rxnorm/intake-aliases.json")).text();
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await Bun.write(resolve(sourceDir, "manifest.json"), serialized);
await mkdir(resolve(repoRoot, "web/public/data"), { recursive: true });
await Bun.write(resolve(repoRoot, "web/public/data/ddinter-manifest.json"), serialized);
await mkdir(resolve(repoRoot, "web/lib/data"), { recursive: true });
await Bun.write(resolve(repoRoot, "web/lib/data/ddinter-drugs.json"), `${JSON.stringify(drugNames, null, 2)}\n`);
await Bun.write(resolve(repoRoot, "web/lib/data/rxnorm-aliases.json"), rxnormAliases);
console.log(formatCoverage(manifest));
