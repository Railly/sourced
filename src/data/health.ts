import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCoverage, verifyDdinterManifest } from "./ddinter-manifest.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = await verifyDdinterManifest(repoRoot);
console.log(formatCoverage(manifest));
