import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CacheEntry {
  url: string;
  retrieved_at: string;
  data: unknown;
}

export interface SourceResponse {
  data: any;
  retrievedAt: string;
  cache: "hit" | "miss" | "stale-fallback";
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cacheDir = resolve(repoRoot, "data/cache/openfda");
const timeoutMs = 12_000;

function cachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return resolve(cacheDir, `${hash}.json`);
}

function ttlMs(): number {
  const hours = Number.parseFloat(process.env.SOURCED_OPENFDA_CACHE_TTL_HOURS ?? "168");
  return Number.isFinite(hours) && hours >= 0 ? hours * 60 * 60 * 1000 : 168 * 60 * 60 * 1000;
}

function isFresh(entry: CacheEntry, now: string): boolean {
  const retrieved = Date.parse(entry.retrieved_at);
  const requested = Date.parse(now);
  if (!Number.isFinite(retrieved) || !Number.isFinite(requested)) return false;
  const age = requested - retrieved;
  return age >= 0 && age <= ttlMs();
}

async function readCache(url: string): Promise<CacheEntry | null> {
  try {
    const entry = JSON.parse(await readFile(cachePath(url), "utf8")) as CacheEntry;
    return entry.url === url && typeof entry.retrieved_at === "string" ? entry : null;
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath(entry.url), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    return;
  }
}

export async function getSourceJson(url: string, now: string): Promise<SourceResponse | null> {
  const cached = await readCache(url);
  if (cached && process.env.SOURCED_REFRESH_SOURCES !== "1" && isFresh(cached, now)) {
    return { data: cached.data, retrievedAt: cached.retrieved_at, cache: "hit" };
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`source request failed: ${response.status}`);
    const data = await response.json();
    await writeCache({ url, retrieved_at: now, data });
    return { data, retrievedAt: now, cache: "miss" };
  } catch {
    if (cached) {
      return { data: cached.data, retrievedAt: cached.retrieved_at, cache: "stale-fallback" };
    }
    return null;
  }
}
