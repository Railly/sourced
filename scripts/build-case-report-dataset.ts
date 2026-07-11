import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

interface PublishedCase {
  id: string;
  pmcid: string;
  pmid: string;
  title: string;
  domain: string;
  source_url: string;
  license: "CC BY" | "CC BY-NC-SA";
  license_url: string;
  section_heading: string;
  expected_medications: string[];
}

interface CaseManifest {
  retrieved_at: string;
  cases: PublishedCase[];
}

const repoRoot = resolve(import.meta.dir, "..");
const datasetRoot = resolve(repoRoot, "data/case-reports");
const textRoot = resolve(datasetRoot, "text");
const pdfRoot = resolve(datasetRoot, "pdfs");
const licenseRoot = resolve(datasetRoot, "licenses");
const publicPdfRoot = resolve(repoRoot, "web/public/cases");
const publicManifestPath = resolve(repoRoot, "web/public/data/published-cases.json");
const manifest = (await Bun.file(resolve(datasetRoot, "manifest.json")).json()) as CaseManifest;

await mkdir(textRoot, { recursive: true });
await mkdir(pdfRoot, { recursive: true });
await mkdir(licenseRoot, { recursive: true });
await mkdir(publicPdfRoot, { recursive: true });

function sectionFrom(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const wanted = heading.trim().toLowerCase();
  const start = lines.findIndex((line) => line.replace(/^#+\s+/, "").trim().toLowerCase() === wanted);
  if (start < 0) throw new Error(`Section not found: ${heading}`);
  const level = lines[start]!.match(/^#+/)?.[0].length ?? 2;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const nextLevel = lines[index]!.match(/^#+\s+/)?.[0].trim().length;
    if (nextLevel && nextLevel <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

async function command(args: string[], attempts = 1): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const process = Bun.spawn(args, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      process.kill();
    }, 180_000);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    clearTimeout(timeout);
    if (exitCode === 0) return stdout;
    lastError = timedOut ? `${args[0]} timed out after 180000ms` : stderr || stdout;
    if (attempt < attempts) await Bun.sleep(1_000 * attempt);
  }
  throw new Error(`${args[0]} failed: ${lastError}`);
}

async function fetchText(url: string, attempts = 3): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "Sourced hackathon dataset builder (license verification)" },
      });
      if (response.ok) return response.text();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await Bun.sleep(1_000 * attempt);
  }
  throw new Error(`${url}: ${lastError}`);
}

const generated: Array<{
  id: string;
  pdf: string;
  text: string;
  bytes: number;
  excerpt_sha256: string;
  excerpt_characters: number;
  pdf_sha256: string;
  license_evidence: string;
  license_sha256: string;
}> = [];

async function sha256(file: Blob): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
}

for (const item of manifest.cases) {
  const licenseEvidence = await fetchText(item.license_url);
  const licenseMatch = licenseEvidence.match(/<record[^>]+license="([^"]+)"/i)?.[1];
  if (licenseMatch !== item.license) {
    throw new Error(`${item.id}: expected ${item.license}, OA service returned ${licenseMatch ?? "no license"}`);
  }
  const licensePath = resolve(licenseRoot, `${item.id}.xml`);
  await Bun.write(licensePath, licenseEvidence);

  let excerpt = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const article = await command(["agent-browser", "read", item.source_url, "--max-output", "120000"], 3);
    try {
      excerpt = sectionFrom(article, item.section_heading);
      break;
    } catch (error) {
      if (attempt === 3) throw new Error(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
      await Bun.sleep(1_000 * attempt);
    }
  }
  const markdown = `---
title: "${item.title.replaceAll('"', '\\"')}"
geometry: margin=1in
fontsize: 10pt
---

# ${item.title}

Published case report: ${item.pmcid} / PMID ${item.pmid}

Source: ${item.source_url}

License: ${item.license}

License evidence: ${item.license_url}

Dataset note: This case section was extracted mechanically from the cited PMC article. No clinical facts were added.

${excerpt}
`;
  const textPath = resolve(textRoot, `${item.id}.md`);
  const pdfPath = resolve(pdfRoot, `${item.id}.pdf`);
  await Bun.write(textPath, markdown);
  await command([
    "pandoc",
    textPath,
    "--from",
    "markdown",
    "--pdf-engine=xelatex",
    "-V",
    "geometry:margin=1in",
    "-o",
    pdfPath,
  ]);
  const pdf = Bun.file(pdfPath);
  await Bun.write(resolve(publicPdfRoot, `${item.id}.pdf`), pdf);
  generated.push({
    id: item.id,
    pdf: `pdfs/${item.id}.pdf`,
    text: `text/${item.id}.md`,
    bytes: pdf.size,
    excerpt_sha256: new Bun.CryptoHasher("sha256").update(excerpt).digest("hex"),
    excerpt_characters: excerpt.length,
    pdf_sha256: await sha256(pdf),
    license_evidence: `licenses/${item.id}.xml`,
    license_sha256: new Bun.CryptoHasher("sha256").update(licenseEvidence).digest("hex"),
  });
}

await Bun.write(
  resolve(datasetRoot, "build.json"),
  `${JSON.stringify({ generated_at: new Date().toISOString(), cases: generated }, null, 2)}\n`,
);

await Bun.write(
  publicManifestPath,
  `${JSON.stringify(
    {
      cases: manifest.cases.map((item) => ({
        id: item.id,
        pmcid: item.pmcid,
        title: item.title,
        domain: item.domain,
        source_url: item.source_url,
        license: item.license,
        pdf_url: `/cases/${item.id}.pdf`,
        safety_focus: item.expected_medications.join(" + "),
      })),
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ cases: generated.length, pdfRoot, generated }, null, 2));
