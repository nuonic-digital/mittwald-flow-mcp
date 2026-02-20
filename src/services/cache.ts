import type { CacheEntry } from "../types.js";

export const TTL = {
  REGISTRY: 60 * 60 * 1000,
  MDX: 30 * 60 * 1000,
  DEVELOP: 120 * 60 * 1000,
  EXAMPLE: 30 * 60 * 1000,
} as const;

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttl: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttl });
}
