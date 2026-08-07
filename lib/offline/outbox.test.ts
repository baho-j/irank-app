import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { getDb } from "./db";
import {
  backoffMs,
  conflicts,
  count,
  discard,
  enqueue,
  markFailed,
  markSucceeded,
  markSyncing,
  pending,
} from "./outbox";
import { clearDraft, loadDraft, saveDraft } from "./drafts";

beforeEach(async () => {
  const db = getDb();
  await db?.outbox.clear();
  await db?.drafts.clear();
});

const ballot = (score: number) => ({
  mutation: "submitBallot",
  args: { debate_id: "d1", score },
});

describe("outbox durability", () => {
  test("a queued mutation is retrievable after the process that queued it is gone", async () => {
    await enqueue(ballot(28));

    // A fresh read stands in for a reload: nothing is held in memory.
    const queued = await pending();

    expect(queued).toHaveLength(1);
    expect(queued[0].args).toEqual({ debate_id: "d1", score: 28 });
    expect(queued[0].status).toBe("pending");
  });

  test("reports a real queue count rather than zero", async () => {
    expect(await count()).toBe(0);

    await enqueue(ballot(28));
    await enqueue(ballot(29));

    expect(await count()).toBe(2);
  });

  test("each entry gets a distinct idempotency key", async () => {
    const first = await enqueue(ballot(28));
    const second = await enqueue(ballot(29));

    expect(first).not.toBe(second);
  });

  test("a successful sync removes the entry so replay cannot double-apply", async () => {
    const key = await enqueue(ballot(28));

    await markSyncing(key!);
    await markSucceeded(key!);

    expect(await count()).toBe(0);
    expect(await pending()).toHaveLength(0);
  });

  test("a failed sync keeps the entry queued for retry", async () => {
    const key = await enqueue(ballot(28));

    await markFailed(key!, "network unreachable");

    const queued = await pending();
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe("failed");
    expect(queued[0].attempts).toBe(1);
    expect(queued[0].last_error).toBe("network unreachable");
  });

  test("entries drain oldest first", async () => {
    await enqueue(ballot(1));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await enqueue(ballot(2));

    const queued = await pending();

    expect(queued[0].args.score).toBe(1);
    expect(queued[1].args.score).toBe(2);
  });

  test("repeated draft edits collapse to one pending write", async () => {
    await enqueue({ ...ballot(28), dedupeKey: "draft:d1:j1" });
    await enqueue({ ...ballot(29), dedupeKey: "draft:d1:j1" });
    await enqueue({ ...ballot(30), dedupeKey: "draft:d1:j1" });

    const queued = await pending();

    expect(queued).toHaveLength(1);
    expect(queued[0].args.score).toBe(30);
  });

  test("different ballots are not collapsed together", async () => {
    await enqueue({ ...ballot(28), dedupeKey: "draft:d1:j1" });
    await enqueue({ ...ballot(28), dedupeKey: "draft:d2:j1" });

    expect(await pending()).toHaveLength(2);
  });

  test("an entry that keeps failing becomes a conflict rather than retrying forever", async () => {
    const key = await enqueue(ballot(28));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await markFailed(key!, "rejected");
    }

    expect(await pending()).toHaveLength(0);

    const unresolved = await conflicts();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].attempts).toBe(6);
  });

  test("a conflict can be discarded once a human resolves it", async () => {
    const key = await enqueue(ballot(28));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await markFailed(key!, "rejected");
    }

    await discard(key!);

    expect(await conflicts()).toHaveLength(0);
  });

  test("backoff grows and is capped", async () => {
    expect(backoffMs(0)).toBeLessThan(1500);
    expect(backoffMs(3)).toBeGreaterThan(backoffMs(1));
    expect(backoffMs(20)).toBeLessThanOrEqual(60_250);
  });
});

describe("ballot drafts", () => {
  test("a draft survives being read back fresh", async () => {
    await saveDraft("d1", "j1", { scores: { s1: { style: 28 } }, rfd: "partial" });

    expect(await loadDraft("d1", "j1")).toEqual({
      scores: { s1: { style: 28 } },
      rfd: "partial",
    });
  });

  test("saving again replaces rather than duplicates", async () => {
    await saveDraft("d1", "j1", { rfd: "first" });
    await saveDraft("d1", "j1", { rfd: "second" });

    expect(await loadDraft("d1", "j1")).toEqual({ rfd: "second" });
  });

  test("each judge keeps their own draft for the same debate", async () => {
    await saveDraft("d1", "j1", { rfd: "judge one" });
    await saveDraft("d1", "j2", { rfd: "judge two" });

    expect(await loadDraft("d1", "j1")).toEqual({ rfd: "judge one" });
    expect(await loadDraft("d1", "j2")).toEqual({ rfd: "judge two" });
  });

  test("a missing draft reads as null rather than throwing", async () => {
    expect(await loadDraft("nope", "nobody")).toBeNull();
  });

  test("clearing removes only that judge's draft", async () => {
    await saveDraft("d1", "j1", { rfd: "one" });
    await saveDraft("d1", "j2", { rfd: "two" });

    await clearDraft("d1", "j1");

    expect(await loadDraft("d1", "j1")).toBeNull();
    expect(await loadDraft("d1", "j2")).toEqual({ rfd: "two" });
  });
});
