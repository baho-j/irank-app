import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { getDb } from "./db";
import { cacheKeys, clearExpiredCache, readCache, writeCache } from "./cache";

beforeEach(async () => {
  await getDb()?.cache.clear();
});

const leaderboard = [
  { entity_id: "s1", rank: 1, totalPoints: 210 },
  { entity_id: "s2", rank: 2, totalPoints: 190 },
];

describe("offline ranking cache", () => {
  test("a released ranking is readable after the fetch that produced it", async () => {
    await writeCache(cacheKeys.leaderboard("student"), leaderboard);

    const entry = await readCache<typeof leaderboard>(cacheKeys.leaderboard("student"));

    expect(entry?.value).toEqual(leaderboard);
    expect(entry?.stale).toBe(false);
  });

  test("a ranking never fetched is simply absent", async () => {
    expect(await readCache(cacheKeys.leaderboard("volunteer"))).toBeNull();
  });

  test("writing again replaces rather than duplicating", async () => {
    await writeCache(cacheKeys.leaderboard("student"), leaderboard);
    await writeCache(cacheKeys.leaderboard("student"), [leaderboard[0]]);

    const entry = await readCache<typeof leaderboard>(cacheKeys.leaderboard("student"));

    expect(entry?.value).toHaveLength(1);
  });

  test("scopes are cached independently", async () => {
    await writeCache(cacheKeys.leaderboard("student"), leaderboard);
    await writeCache(cacheKeys.leaderboard("school"), [leaderboard[1]]);

    expect((await readCache<any[]>(cacheKeys.leaderboard("student")))?.value).toHaveLength(2);
    expect((await readCache<any[]>(cacheKeys.leaderboard("school")))?.value).toHaveLength(1);
  });

  test("an expired entry is served but marked stale", async () => {
    await writeCache(cacheKeys.tierTable(), leaderboard, -1000);

    const entry = await readCache<typeof leaderboard>(cacheKeys.tierTable());

    expect(entry?.value).toEqual(leaderboard);
    expect(entry?.stale).toBe(true);
  });

  test("a recently expired entry survives cleanup, since stale beats nothing offline", async () => {
    await writeCache(cacheKeys.tierTable(), leaderboard, -1000);

    await clearExpiredCache();

    expect(await readCache(cacheKeys.tierTable())).not.toBeNull();
  });

  test("a long-dead entry is cleared", async () => {
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    await writeCache(cacheKeys.tierTable(), leaderboard, -twoWeeks);

    const removed = await clearExpiredCache();

    expect(removed).toBe(1);
    expect(await readCache(cacheKeys.tierTable())).toBeNull();
  });

  test("keys distinguish every cached ranking", () => {
    const keys = [
      cacheKeys.leaderboard("student"),
      cacheKeys.leaderboard("school"),
      cacheKeys.myRank("student", "u1"),
      cacheKeys.myRank("student", "u2"),
      cacheKeys.schoolTier("sc1"),
      cacheKeys.tierTable(),
      cacheKeys.tournamentRankings("t1", "prelims"),
      cacheKeys.tournamentRankings("t1", "full_tournament"),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  test("cached rankings survive a fresh read, standing in for a reload", async () => {
    await writeCache(cacheKeys.myRank("student", "u1"), { rank: 3, rankChange: 1 });

    const entry = await readCache<{ rank: number }>(cacheKeys.myRank("student", "u1"));

    expect(entry?.value.rank).toBe(3);
  });
});
