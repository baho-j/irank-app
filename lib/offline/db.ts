import Dexie, { type Table } from "dexie";

export type OutboxStatus = "pending" | "syncing" | "failed" | "conflict";

export interface OutboxEntry {
  /** Stable across retries, so replaying can never double-apply. */
  idempotency_key: string;
  mutation: string;
  args: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  created_at: number;
  updated_at: number;
  last_error?: string;
  /** Groups entries so a ballot's draft can be superseded by its own later edit. */
  dedupe_key?: string;
}

export interface DraftEntry {
  /** `${debateId}:${judgeId}` — one in-progress ballot per judge per debate. */
  key: string;
  debate_id: string;
  judge_id: string;
  payload: Record<string, unknown>;
  updated_at: number;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updated_at: number;
  expires_at: number;
}

class IRankDatabase extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  drafts!: Table<DraftEntry, string>;
  cache!: Table<CacheEntry, string>;

  constructor() {
    super("irank");

    this.version(1).stores({
      outbox: "idempotency_key, status, created_at, dedupe_key",
      drafts: "key, debate_id, updated_at",
      cache: "key, expires_at",
    });
  }
}

let database: IRankDatabase | null = null;

/**
 * Returns null during SSR and prerender, where IndexedDB does not exist.
 * Callers treat a null database as "no local layer available" rather than
 * crashing the render.
 */
export function getDb(): IRankDatabase | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return null;
  }

  if (!database) {
    database = new IRankDatabase();
  }

  return database;
}
