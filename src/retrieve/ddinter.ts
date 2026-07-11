import { basename, join } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

export interface DdinterRow {
  drugA: string;
  drugB: string;
  level: string;
  idA: string;
  idB: string;
  sourceFile?: string;
}

export interface DdinterCoverage {
  files: string[];
  rawRows: number;
  uniquePairs: number;
  uniqueDrugs: number;
  severities: Record<string, number>;
}

export interface DdinterDataset {
  byPair: Map<string, DdinterRow>;
  coverage: DdinterCoverage;
}

const severityRank: Record<string, number> = {
  Major: 4,
  Moderate: 3,
  Minor: 2,
  Unknown: 1,
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("DDInter CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function normalizeDrugKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ddinterPairKey(drugA: string, drugB: string): string {
  const values = [normalizeDrugKey(drugA), normalizeDrugKey(drugB)].sort();
  return `${values[0]}\u001f${values[1]}`;
}

export function createDdinterDataset(rows: DdinterRow[], files: string[] = []): DdinterDataset {
  const byPair = new Map<string, DdinterRow>();
  const drugs = new Set<string>();
  const severities: Record<string, number> = {};

  for (const row of rows) {
    const drugAKey = normalizeDrugKey(row.drugA);
    const drugBKey = normalizeDrugKey(row.drugB);
    if (!drugAKey || !drugBKey) continue;
    drugs.add(drugAKey);
    drugs.add(drugBKey);
    severities[row.level] = (severities[row.level] ?? 0) + 1;
    const key = ddinterPairKey(row.drugA, row.drugB);
    const current = byPair.get(key);
    if (!current || (severityRank[row.level] ?? 0) > (severityRank[current.level] ?? 0)) {
      byPair.set(key, row);
    }
  }

  return {
    byPair,
    coverage: {
      files,
      rawRows: rows.length,
      uniquePairs: byPair.size,
      uniqueDrugs: drugs.size,
      severities,
    },
  };
}

export function parseDdinterCsv(text: string, sourceFile?: string): DdinterRow[] {
  const [header, ...records] = parseCsv(text);
  const expected = ["DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"];
  if (!header || expected.some((value, index) => header[index] !== value)) {
    throw new Error(`Invalid DDInter header in ${sourceFile ?? "CSV"}`);
  }

  return records.flatMap((record) => {
    const [idA, drugA, idB, drugB, level] = record;
    if (!idA || !drugA || !idB || !drugB || !level) return [];
    return [{ idA, drugA, idB, drugB, level: level.trim(), sourceFile }];
  });
}

const datasetCache = new Map<string, Promise<DdinterDataset>>();

async function loadDdinterUncached(sourcePath: string): Promise<DdinterDataset> {
  const sourceStat = await stat(sourcePath);
  const paths = sourceStat.isDirectory()
    ? (await readdir(sourcePath))
        .filter((name) => name.endsWith(".csv"))
        .sort()
        .map((name) => join(sourcePath, name))
    : [sourcePath];
  if (paths.length === 0) throw new Error(`No DDInter CSV files found at ${sourcePath}`);

  const files = paths.map((path) => basename(path));
  const parsed = await Promise.all(
    paths.map(async (path) => parseDdinterCsv(await readFile(path, "utf8"), basename(path))),
  );
  return createDdinterDataset(parsed.flat(), files);
}

export async function loadDdinter(sourcePath: string): Promise<DdinterDataset> {
  const cached = datasetCache.get(sourcePath);
  if (cached) return cached;
  const pending = loadDdinterUncached(sourcePath);
  datasetCache.set(sourcePath, pending);
  try {
    return await pending;
  } catch (error) {
    datasetCache.delete(sourcePath);
    throw error;
  }
}
