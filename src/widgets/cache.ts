import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { CACHE_DIR } from '../config.js';

interface CacheEntry<T> {
  ts: number;
  data: T;
}

export function loadCache<T>(name: string, ttlSeconds: number): T | null {
  const file = `${CACHE_DIR}/${name}.json`;
  if (!existsSync(file)) return null;
  try {
    const entry = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry<T>;
    if (Date.now() / 1000 - entry.ts < ttlSeconds) return entry.data;
  } catch { /* */ }
  return null;
}

export function saveCache<T>(name: string, data: T): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry<T> = { ts: Date.now() / 1000, data };
  writeFileSync(`${CACHE_DIR}/${name}.json`, JSON.stringify(entry));
}
