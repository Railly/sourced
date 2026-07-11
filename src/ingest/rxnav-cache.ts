import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cachePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/fixtures/rxnav-cache.json");

type CacheMap = Record<string, unknown>;

let cache: CacheMap | null = null;
let dirty = false;

function load(): CacheMap {
  if (cache) return cache;
  if (existsSync(cachePath)) {
    try {
      cache = JSON.parse(readFileSync(cachePath, "utf8")) as CacheMap;
    } catch {
      cache = {};
    }
  } else {
    cache = {};
  }
  return cache;
}

/**
 * Committed RxNav responses keyed by request URL. A hit returns the recorded
 * JSON with zero network, which keeps ingest tests hermetic and the precompute
 * step deterministic. A miss falls through to the live fetch; recording is only
 * enabled when RXNAV_RECORD=1 so production runs never mutate the committed
 * fixture.
 */
export function getCachedRxNav(url: string): unknown {
  const map = load();
  return Object.prototype.hasOwnProperty.call(map, url) ? map[url] : undefined;
}

export function isRxNavRecording(): boolean {
  return process.env.RXNAV_RECORD === "1";
}

/**
 * When set, a cache miss is a hard error instead of a live request. Used to
 * prove the ingest tests and precompute are hermetic (no network) in CI.
 */
export function isRxNavOffline(): boolean {
  return process.env.RXNAV_OFFLINE === "1";
}

export function putCachedRxNav(url: string, value: unknown): void {
  if (!isRxNavRecording()) return;
  const map = load();
  map[url] = value;
  dirty = true;
}

export function flushRxNavCache(): void {
  if (!dirty || !cache) return;
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, `${JSON.stringify(sorted, null, 2)}\n`);
  dirty = false;
}
