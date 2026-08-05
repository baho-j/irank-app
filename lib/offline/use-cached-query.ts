"use client";

import { useEffect, useState } from "react";
import { readCache, writeCache } from "./cache";

export interface CachedQueryResult<T> {
  data: T | undefined;
  /** True when the data came from the local cache rather than the server. */
  isFromCache: boolean;
  /** When the cached copy was written, so the UI can say how old it is. */
  cachedAt: number | null;
  isStale: boolean;
}

/**
 * Keeps the last server result for a query on the device and serves it when
 * the query cannot reach the server.
 *
 * A ranking has to be fetched once online, which is unavoidable — the device
 * cannot know a result it has never seen. After that it stays readable with no
 * connectivity, which is what matters at a venue.
 */
export function useCachedQuery<T>(
  key: string,
  liveResult: T | undefined
): CachedQueryResult<T> {
  const [cached, setCached] = useState<T | undefined>(undefined);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    let active = true;

    void readCache<T>(key).then((entry) => {
      if (!active || !entry) return;

      setCached(entry.value);
      setCachedAt(entry.updated_at);
      setIsStale(entry.stale);
    });

    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (liveResult === undefined) return;

    void writeCache(key, liveResult);
    setCachedAt(Date.now());
    setIsStale(false);
  }, [key, liveResult]);

  if (liveResult !== undefined) {
    return { data: liveResult, isFromCache: false, cachedAt, isStale: false };
  }

  return { data: cached, isFromCache: cached !== undefined, cachedAt, isStale };
}
