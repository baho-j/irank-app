import { getDb } from "./db";
import { writeCache } from "./cache";
import { enqueue } from "./outbox";
import type { BundleEntity, ReviewItem } from "./bundle";

export interface ApplyResult {
  accepted: number;
  declined: number;
  failed: Array<{ id: string; error: string }>;
}

/**
 * Applies only the items the receiver accepted. Declined items are skipped
 * entirely, so importing never silently overwrites work the receiver wanted
 * to keep.
 */
export async function applyReview(
  items: ReviewItem[],
  acceptedIds: Set<string>
): Promise<ApplyResult> {
  const result: ApplyResult = { accepted: 0, declined: 0, failed: [] };
  const db = getDb();

  for (const item of items) {
    if (!acceptedIds.has(item.entity.id)) {
      result.declined += 1;
      continue;
    }

    try {
      await applyEntity(item.entity, db);
      result.accepted += 1;
    } catch (error: any) {
      result.failed.push({
        id: item.entity.id,
        error: error?.message ?? "Could not apply this item",
      });
    }
  }

  return result;
}

async function applyEntity(
  entity: BundleEntity,
  db: ReturnType<typeof getDb>
): Promise<void> {
  switch (entity.type) {
    case "draft": {
      if (!db) throw new Error("No local storage available");

      const [debate_id, judge_id] = entity.id.split(":");

      await db.drafts.put({
        key: entity.id,
        debate_id,
        judge_id,
        payload: entity.payload as Record<string, unknown>,
        updated_at: entity.updated_at,
      });
      return;
    }

    case "ballot": {
      // An accepted ballot joins this device's outbox and syncs like any other
      // write, carrying its original idempotency key so the server cannot
      // apply it twice if both devices eventually reconnect.
      const payload = entity.payload as { mutation: string; args: Record<string, unknown> };

      await enqueue({
        mutation: payload.mutation,
        args: payload.args,
        dedupeKey: `imported:${entity.id}`,
      });
      return;
    }

    case "ranking": {
      await writeCache(entity.id, entity.payload);
      return;
    }

    case "lineup":
    case "payment": {
      if (!db) throw new Error("No local storage available");

      await writeCache(`imported:${entity.type}:${entity.id}`, entity.payload);
      return;
    }
  }
}
