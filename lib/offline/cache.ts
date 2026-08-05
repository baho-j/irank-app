import { getDb } from "./db";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Explicit keys, unlike the previous scheme which derived them by parsing a
 * stack trace and so collided under minification.
 */
export const cacheKeys = {
  leaderboard: (scope: string) => `leaderboard:${scope}`,
  myRank: (scope: string, entityId: string) => `rank:${scope}:${entityId}`,
  schoolTier: (schoolId: string) => `tier:${schoolId}`,
  tierTable: () => "tier-table",
  tournamentRankings: (tournamentId: string, scope: string) =>
    `tournament-rankings:${tournamentId}:${scope}`,
};

export async function writeCache(
  key: string,
  value: unknown,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const now = Date.now();

  await db.cache.put({
    key,
    value,
    updated_at: now,
    expires_at: now + ttlMs,
  });
}

export interface CachedValue<T> {
  value: T;
  updated_at: number;
  stale: boolean;
}

/**
 * Returns an expired entry marked stale rather than discarding it. A ranking
 * from last week is more use to someone with no connectivity than nothing at
 * all, provided the UI says how old it is.
 */
export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  const db = getDb();
  if (!db) return null;

  const entry = await db.cache.get(key);
  if (!entry) return null;

  return {
    value: entry.value as T,
    updated_at: entry.updated_at,
    stale: entry.expires_at < Date.now(),
  };
}

export async function clearExpiredCache(): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const expired = await db.cache.where("expires_at").below(Date.now()).toArray();

  // Kept for a grace period past expiry so an offline device still has
  // something to show; only long-dead entries are removed.
  const graceCutoff = Date.now() - DEFAULT_TTL_MS;
  const removable = expired.filter((entry) => entry.expires_at < graceCutoff);

  await Promise.all(removable.map((entry) => db.cache.delete(entry.key)));

  return removable.length;
}
