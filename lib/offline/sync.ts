import {
  backoffMs,
  markFailed,
  markSucceeded,
  markSyncing,
  pending,
} from "./outbox";
import type { OutboxEntry } from "./db";

export type SyncDispatch = (entry: OutboxEntry) => Promise<void>;

export interface SyncLogEntry {
  table_name: string;
  record_id: string;
  operation: "create" | "update" | "delete";
  status: "pending" | "completed" | "failed" | "conflict";
  local_timestamp: number;
  error?: string;
}

/** Reports outcomes to the server so tab can see what each device still owes. */
export type SyncReporter = (entries: SyncLogEntry[]) => Promise<void>;

export interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

function logEntryFor(entry: OutboxEntry, status: SyncLogEntry["status"], error?: string): SyncLogEntry {
  return {
    table_name: entry.mutation,
    record_id: entry.idempotency_key,
    operation: "update",
    status,
    local_timestamp: entry.created_at,
    error,
  };
}

/**
 * Drains the outbox oldest-first, stopping at the first failure so a run of
 * writes cannot be applied out of order. The idempotency key travels with each
 * entry, so a write the server already accepted is safe to replay.
 */
export async function drain(
  dispatch: SyncDispatch,
  report?: SyncReporter
): Promise<SyncResult> {
  const entries = await pending();
  const result: SyncResult = { attempted: 0, succeeded: 0, failed: 0 };
  const logs: SyncLogEntry[] = [];

  for (const entry of entries) {
    result.attempted += 1;

    if (entry.attempts > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(entry.attempts)));
    }

    await markSyncing(entry.idempotency_key);

    try {
      await dispatch(entry);
      await markSucceeded(entry.idempotency_key);
      logs.push(logEntryFor(entry, "completed"));
      result.succeeded += 1;
    } catch (error: any) {
      const message = error?.message ?? "Sync failed";
      await markFailed(entry.idempotency_key, message);
      logs.push(logEntryFor(entry, "failed", message));
      result.failed += 1;
      break;
    }
  }

  // Reporting is bookkeeping; a failure here must not lose the drain's result.
  if (report && logs.length > 0) {
    try {
      await report(logs);
    } catch {
      // The device keeps its own record either way.
    }
  }

  return result;
}
