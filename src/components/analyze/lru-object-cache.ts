/**
 * Shared "Map ordered by recency, revoke and evict oldest past a cap"
 * helper for the object-URL / decoded-image caches used by the volume
 * viewer and its clipping-slice hook. Both caches key on Map insertion
 * order to represent recency (touching an entry re-inserts it at the end),
 * so unifying them here is safe.
 *
 * Note: coords2d-viewer.tsx and tiltseries-viewer.tsx have their own
 * eviction helpers too, but those are deliberately timestamp-based (a
 * cache read there mutates a `lastUsed`/`usedAt` field in place instead of
 * reordering the Map), which this insertion-order strategy can't just
 * replace without changing their tuned scrubbing/prefetch behavior -- they
 * are left as-is.
 */

export type RevocableCacheEntry = {
  revoke: () => void;
};

/** Marks `key` as most-recently-used and returns its entry, or null if absent. */
export function touchCachedEntry<K, V extends RevocableCacheEntry>(
  cache: Map<K, V>,
  key: K,
): V | null {
  const entry = cache.get(key);
  if (!entry) return null;

  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

/**
 * Evicts the oldest (least-recently-used) entries, revoking each, until
 * `cache.size <= maxItems`. Entries whose key is in `keepKeys` are never
 * evicted, even if they would otherwise be the oldest.
 */
export function evictOldestCacheEntries<K, V extends RevocableCacheEntry>(
  cache: Map<K, V>,
  maxItems: number,
  keepKeys?: Set<K>,
): void {
  for (const key of cache.keys()) {
    if (cache.size <= maxItems) break;
    if (keepKeys?.has(key)) continue;

    const entry = cache.get(key);
    cache.delete(key);
    entry?.revoke();
  }
}

/**
 * Stores `entry` under `key` (revoking any different entry that key
 * previously held), touches it as most-recently-used, then evicts down to
 * `maxItems`.
 */
export function storeCachedEntry<K, V extends RevocableCacheEntry>(
  cache: Map<K, V>,
  key: K,
  entry: V,
  maxItems: number,
  keepKeys?: Set<K>,
): void {
  const previous = cache.get(key);
  if (previous && previous !== entry) previous.revoke();

  cache.delete(key);
  cache.set(key, entry);

  evictOldestCacheEntries(cache, maxItems, keepKeys);
}

/** Revokes every entry and empties the cache. */
export function clearCachedEntries<K, V extends RevocableCacheEntry>(
  cache: Map<K, V>,
): void {
  for (const entry of cache.values()) entry.revoke();
  cache.clear();
}
