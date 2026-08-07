import { getDb } from "./db";

function draftKey(debateId: string, judgeId: string): string {
  return `${debateId}:${judgeId}`;
}

/**
 * Written on every edit, so a judge who reloads, crashes, or runs out of
 * battery mid-debate reopens the ballot exactly where they left it. This is
 * local only; syncing to Convex is the outbox's job.
 */
export async function saveDraft(
  debateId: string,
  judgeId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.drafts.put({
    key: draftKey(debateId, judgeId),
    debate_id: debateId,
    judge_id: judgeId,
    payload,
    updated_at: Date.now(),
  });
}

export async function loadDraft(
  debateId: string,
  judgeId: string
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  if (!db) return null;

  const draft = await db.drafts.get(draftKey(debateId, judgeId));

  return draft?.payload ?? null;
}

export async function clearDraft(debateId: string, judgeId: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.drafts.delete(draftKey(debateId, judgeId));
}

export async function draftsForDebate(debateId: string) {
  const db = getDb();
  if (!db) return [];

  return await db.drafts.where("debate_id").equals(debateId).toArray();
}
