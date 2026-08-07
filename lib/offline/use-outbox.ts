"use client";

import { useCallback, useEffect, useState } from "react";
import { count as outboxCount } from "./outbox";
import { drain, type SyncDispatch, type SyncResult } from "./sync";

const POLL_MS = 3000;

/**
 * Replaces the previous placeholder that always reported an empty queue, so
 * the offline banner can tell a judge how much work is still waiting to reach
 * the server.
 */
export function useOutbox(dispatch?: SyncDispatch) {
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const refresh = useCallback(async () => {
    setQueueCount(await outboxCount());
  }, []);

  // The queue lives in IndexedDB, which has no change notification, so its
  // depth is polled. Reads after unmount are dropped rather than applied.
  useEffect(() => {
    let active = true;

    const read = async () => {
      const next = await outboxCount();
      if (active) setQueueCount(next);
    };

    void read();

    const interval = window.setInterval(read, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const sync = useCallback(async () => {
    if (!dispatch || isSyncing) return;

    setIsSyncing(true);

    try {
      const result = await drain(dispatch);
      setLastResult(result);
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [dispatch, isSyncing, refresh]);

  useEffect(() => {
    if (!dispatch) return;

    const onOnline = () => void sync();

    window.addEventListener("online", onOnline);

    return () => window.removeEventListener("online", onOnline);
  }, [dispatch, sync]);

  return { queueCount, isSyncing, lastResult, sync, refresh };
}
