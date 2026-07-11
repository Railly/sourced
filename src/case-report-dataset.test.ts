import { expect, test } from "bun:test";
import { resolve } from "node:path";

interface PublishedCase {
  id: string;
  pmcid: string;
  title: string;
  domain: string;
  source_url: string;
  license: string;
  license_url: string;
  expected_medications: string[];
}

interface GeneratedCase {
  id: string;
  pdf: string;
  text: string;
  bytes: number;
  excerpt_sha256: string;
  excerpt_characters: number;
  pdf_sha256: string;
  license_evidence: string;
  license_sha256: string;
}

const repoRoot = resolve(import.meta.dir, "..");
const datasetRoot = resolve(repoRoot, "data/case-reports");
const manifest = (await Bun.file(resolve(datasetRoot, "manifest.json")).json()) as { cases: PublishedCase[] };
const build = (await Bun.file(resolve(datasetRoot, "build.json")).json()) as { cases: GeneratedCase[] };
const publicManifest = (await Bun.file(resolve(repoRoot, "web/public/data/published-cases.json")).json()) as {
  cases: Array<{ id: string; pdf_url: string }>;
};

test("published case dataset has traceable, redistributable sources", () => {
  expect(manifest.cases.length).toBeGreaterThanOrEqual(5);
  expect(new Set(manifest.cases.map((item) => item.id)).size).toBe(manifest.cases.length);
  expect(new Set(manifest.cases.map((item) => item.pmcid)).size).toBe(manifest.cases.length);
  expect(new Set(manifest.cases.map((item) => item.domain)).size).toBeGreaterThanOrEqual(8);
  for (const item of manifest.cases) {
    expect(["CC BY", "CC BY-NC-SA"]).toContain(item.license);
    expect(item.source_url).toBe(`https://pmc.ncbi.nlm.nih.gov/articles/${item.pmcid}/`);
    expect(item.license_url).toContain(`id=${item.pmcid}`);
    expect(item.expected_medications.length).toBeGreaterThanOrEqual(1);
  }
});

test("published medication expectations are source-literal", async () => {
  const normalize = (value: string) => value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const item of manifest.cases) {
    const source = normalize(await Bun.file(resolve(datasetRoot, `text/${item.id}.md`)).text());
    for (const medication of item.expected_medications) {
      const tokens = normalize(medication).split(" ").filter((token) => token.length >= 3);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((token) => source.includes(token))).toBe(true);
    }
  }
});

test("every published case has a generated PDF and immutable excerpt digest", async () => {
  expect(build.cases.length).toBe(manifest.cases.length);
  for (const item of build.cases) {
    const pdf = Bun.file(resolve(datasetRoot, item.pdf));
    const text = Bun.file(resolve(datasetRoot, item.text));
    expect(await pdf.exists()).toBe(true);
    expect(pdf.size).toBe(item.bytes);
    expect(new Uint8Array(await pdf.slice(0, 5).arrayBuffer())).toEqual(new TextEncoder().encode("%PDF-"));
    expect(await text.exists()).toBe(true);
    expect(await text.text()).toContain("No clinical facts were added.");
    expect(item.excerpt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(item.excerpt_characters).toBeGreaterThan(300);
    expect(await new Bun.CryptoHasher("sha256").update(await pdf.arrayBuffer()).digest("hex")).toBe(
      item.pdf_sha256,
    );
    const licenseEvidence = Bun.file(resolve(datasetRoot, item.license_evidence));
    expect(await licenseEvidence.exists()).toBe(true);
    const licenseText = await licenseEvidence.text();
    const source = manifest.cases.find((candidate) => candidate.id === item.id);
    expect(source).toBeDefined();
    expect(licenseText).toContain(`id="${source!.pmcid}"`);
    expect(licenseText).toContain(`license="${source!.license}"`);
    expect(new Bun.CryptoHasher("sha256").update(licenseText).digest("hex")).toBe(item.license_sha256);
  }
});

test("the web gallery exposes the exact published PDF corpus", async () => {
  expect(publicManifest.cases.map((item) => item.id)).toEqual(manifest.cases.map((item) => item.id));
  for (const item of publicManifest.cases) {
    const generated = build.cases.find((candidate) => candidate.id === item.id);
    expect(generated).toBeDefined();
    expect(item.pdf_url).toBe(`/cases/${item.id}.pdf`);
    const publicPdf = Bun.file(resolve(repoRoot, "web/public", item.pdf_url.slice(1)));
    expect(await publicPdf.exists()).toBe(true);
    expect(publicPdf.size).toBe(generated!.bytes);
    expect(new Bun.CryptoHasher("sha256").update(await publicPdf.arrayBuffer()).digest("hex")).toBe(
      generated!.pdf_sha256,
    );
  }
});
