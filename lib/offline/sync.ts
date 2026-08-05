import {
  backoffMs,
  markFailed,
  markSucceeded,
  markSyncing,
  pending,
} from "./outbox";
import type { OutboxEntry } from "./db";

export type SyncDispatch = (entry: OutboxEntry) => Promise<void>;

export interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Drains the outbox oldest-first, stopping at the first failure so a run of
 * writes cannot be applied out of order. The idempotency key travels with each
 * entry, so a write the server already accepted is safe to replay.
 */
export async function drain(dispatch: SyncDispatch): Promise<SyncResult> {
  const entries = await pending();
  const result: SyncResult = { attempted: 0, succeeded: 0, failed: 0 };

  for (const entry of entries) {
    result.attempted += 1;

    if (entry.attempts > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(entry.attempts)));
    }

    await markSyncing(entry.idempotency_key);

    try {
      await dispatch(entry);
      await markSucceeded(entry.idempotency_key);
      result.succeeded += 1;
    } catch (error: any) {
      await markFailed(entry.idempotency_key, error?.message ?? "Sync failed");
      result.failed += 1;
      break;
    }
  }

  return result;
}
