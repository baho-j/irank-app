import { getDb, type OutboxEntry, type OutboxStatus } from "./db";

const MAX_ATTEMPTS = 6;

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface EnqueueOptions {
  mutation: string;
  args: Record<string, unknown>;
  /**
   * Entries sharing a dedupe key collapse to the newest, so a judge editing a
   * draft repeatedly queues one pending write rather than dozens.
   */
  dedupeKey?: string;
}

export async function enqueue({
  mutation,
  args,
  dedupeKey,
}: EnqueueOptions): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const now = Date.now();
  const key = newIdempotencyKey();

  await db.transaction("rw", db.outbox, async () => {
    if (dedupeKey) {
      await db.outbox.where("dedupe_key").equals(dedupeKey).and(
        (entry) => entry.status === "pending"
      ).delete();
    }

    await db.outbox.add({
      idempotency_key: key,
      mutation,
      args,
      status: "pending",
      attempts: 0,
      created_at: now,
      updated_at: now,
      dedupe_key: dedupeKey,
    });
  });

  return key;
}

export async function pending(): Promise<OutboxEntry[]> {
  const db = getDb();
  if (!db) return [];

  const entries = await db.outbox
    .where("status")
    .anyOf(["pending", "failed"] as OutboxStatus[])
    .toArray();

  return entries.sort((a, b) => a.created_at - b.created_at);
}

export async function count(): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  return await db.outbox
    .where("status")
    .anyOf(["pending", "failed", "syncing"] as OutboxStatus[])
    .count();
}

export async function markSyncing(key: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.outbox.update(key, { status: "syncing", updated_at: Date.now() });
}

export async function markSucceeded(key: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.outbox.delete(key);
}

/**
 * A failed entry stays queued and is retried, until it has failed enough times
 * that retrying is not the answer. At that point it becomes a conflict for a
 * human to resolve rather than disappearing.
 */
export async function markFailed(key: string, error: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  const entry = await db.outbox.get(key);
  if (!entry) return;

  const attempts = entry.attempts + 1;

  await db.outbox.update(key, {
    status: attempts >= MAX_ATTEMPTS ? "conflict" : "failed",
    attempts,
    last_error: error,
    updated_at: Date.now(),
  });
}

export async function conflicts(): Promise<OutboxEntry[]> {
  const db = getDb();
  if (!db) return [];

  return await db.outbox.where("status").equals("conflict").toArray();
}

export async function discard(key: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.outbox.delete(key);
}

/** Exponential backoff with jitter, so many devices do not retry in lockstep. */
export function backoffMs(attempts: number): number {
  const base = Math.min(1000 * 2 ** attempts, 60_000);

  return base + Math.random() * 250;
}
