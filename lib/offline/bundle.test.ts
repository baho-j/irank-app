import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { getDb } from "./db";
import { cacheKeys, readCache, writeCache } from "./cache";
import { saveDraft, loadDraft } from "./drafts";
import { enqueue, pending } from "./outbox";
import {
  BUNDLE_VERSION,
  buildBundle,
  checksumOf,
  prepareReview,
  validateBundle,
  type Bundle,
} from "./bundle";
import { applyReview } from "./bundle-apply";

beforeEach(async () => {
  const db = getDb();
  await db?.cache.clear();
  await db?.drafts.clear();
  await db?.outbox.clear();
  localStorage.clear();
});

const RANKINGS = [{ entity_id: "s1", rank: 1, totalPoints: 210 }];

describe("building a bundle", () => {
  test("carries released rankings, not only ballots", async () => {
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
    await writeCache(cacheKeys.tierTable(), [{ school_id: "sc1", tier: "elite" }]);

    const bundle = await buildBundle();
    const types = bundle.entities.map((entity) => entity.type);

    expect(types).toContain("ranking");
    expect(bundle.entities.filter((e) => e.type === "ranking")).toHaveLength(2);
  });

  test("carries in-progress ballot drafts", async () => {
    await saveDraft("d1", "j1", { rfd: "partial" });

    const bundle = await buildBundle();

    expect(bundle.entities.some((entity) => entity.type === "draft")).toBe(true);
  });

  test("carries ballots still waiting to sync", async () => {
    await enqueue({ mutation: "submitBallot", args: { debate_id: "d1" } });

    const bundle = await buildBundle();

    expect(bundle.entities.some((entity) => entity.type === "ballot")).toBe(true);
  });

  test("can be narrowed to one kind of entity", async () => {
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
    await saveDraft("d1", "j1", { rfd: "partial" });

    const bundle = await buildBundle({ include: ["ranking"] });

    expect(bundle.entities.every((entity) => entity.type === "ranking")).toBe(true);
  });

  test("is stamped with this device and the current version", async () => {
    const bundle = await buildBundle();

    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.origin_device).toBeTruthy();
  });
});

describe("validating a bundle", () => {
  const bundleOf = (overrides: Partial<Bundle> = {}): Bundle => {
    const entities = overrides.entities ?? [];

    return {
      version: BUNDLE_VERSION,
      origin_device: "device-a",
      created_at: Date.now(),
      entities,
      checksum: checksumOf(entities),
      ...overrides,
      ...(overrides.entities ? { checksum: checksumOf(overrides.entities) } : {}),
    };
  };

  test("accepts a well-formed bundle", () => {
    expect(validateBundle(bundleOf()).valid).toBe(true);
  });

  test("rejects a bundle from a different app version", () => {
    const result = validateBundle(bundleOf({ version: 99 }));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unsupported_version");
  });

  test("rejects a partial or damaged transfer", () => {
    const bundle = bundleOf({
      entities: [
        { type: "ranking", id: "a", label: "A", payload: {}, updated_at: 1 },
      ],
    });

    // A dropped QR chunk looks exactly like this: fewer entities than the
    // checksum was computed over.
    bundle.entities = [];

    const result = validateBundle(bundle);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("corrupt");
    expect(result.message).toMatch(/incomplete or damaged/i);
  });

  test("rejects a bundle from another tournament", () => {
    const result = validateBundle(bundleOf({ tournament_id: "t2" }), {
      tournamentId: "t1",
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("wrong_tournament");
  });

  test("rejects a bundle that came from this same device", () => {
    const result = validateBundle(bundleOf({ origin_device: "device-a" }), {
      deviceId: "device-a",
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("same_device");
  });
});

describe("reviewing before applying", () => {
  test("marks an item this device has never seen as new", async () => {
    const bundle = await (async () => {
      await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
      const built = await buildBundle({ include: ["ranking"] });
      await getDb()?.cache.clear();
      return built;
    })();

    const review = await prepareReview(bundle);

    expect(review[0].status).toBe("new");
    expect(review[0].mine).toBeNull();
  });

  test("marks an unchanged item as identical", async () => {
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
    const bundle = await buildBundle({ include: ["ranking"] });

    const review = await prepareReview(bundle);

    expect(review[0].status).toBe("identical");
  });

  test("shows mine alongside theirs when they differ", async () => {
    await saveDraft("d1:j1".split(":")[0], "j1", { rfd: "mine" });
    const bundle = await buildBundle({ include: ["draft"] });

    bundle.entities[0].payload = { rfd: "theirs" };
    bundle.entities[0].updated_at = Date.now() + 1000;

    const review = await prepareReview(bundle);

    expect(review[0].status).toBe("newer");
    expect((review[0].mine!.payload as any).rfd).toBe("mine");
    expect((review[0].entity.payload as any).rfd).toBe("theirs");
  });

  test("marks an older incoming item as older, leaving the choice open", async () => {
    await saveDraft("d1", "j1", { rfd: "mine" });
    const bundle = await buildBundle({ include: ["draft"] });

    bundle.entities[0].payload = { rfd: "theirs" };
    bundle.entities[0].updated_at = 1;

    expect((await prepareReview(bundle))[0].status).toBe("older");
  });
});

describe("applying a review", () => {
  test("applies only what the receiver accepted", async () => {
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
    await writeCache(cacheKeys.tierTable(), [{ school_id: "sc1", tier: "elite" }]);
    const bundle = await buildBundle({ include: ["ranking"] });
    await getDb()?.cache.clear();

    const review = await prepareReview(bundle);
    const acceptOne = new Set([review[0].entity.id]);

    const result = await applyReview(review, acceptOne);

    expect(result.accepted).toBe(1);
    expect(result.declined).toBe(1);
    expect(await readCache(review[0].entity.id)).not.toBeNull();
    expect(await readCache(review[1].entity.id)).toBeNull();
  });

  test("declining leaves this device's own copy untouched", async () => {
    await saveDraft("d1", "j1", { rfd: "mine" });
    const bundle = await buildBundle({ include: ["draft"] });
    bundle.entities[0].payload = { rfd: "theirs" };

    const review = await prepareReview(bundle);
    await applyReview(review, new Set());

    expect(await loadDraft("d1", "j1")).toEqual({ rfd: "mine" });
  });

  test("accepting replaces this device's copy", async () => {
    await saveDraft("d1", "j1", { rfd: "mine" });
    const bundle = await buildBundle({ include: ["draft"] });
    bundle.entities[0].payload = { rfd: "theirs" };

    const review = await prepareReview(bundle);
    await applyReview(review, new Set([review[0].entity.id]));

    expect(await loadDraft("d1", "j1")).toEqual({ rfd: "theirs" });
  });

  test("an accepted ballot joins this device's outbox to sync onward", async () => {
    await enqueue({ mutation: "submitBallot", args: { debate_id: "d1", score: 70 } });
    const bundle = await buildBundle({ include: ["ballot"] });
    await getDb()?.outbox.clear();

    const review = await prepareReview(bundle);
    await applyReview(review, new Set([review[0].entity.id]));

    const queued = await pending();

    expect(queued).toHaveLength(1);
    expect(queued[0].args).toEqual({ debate_id: "d1", score: 70 });
  });

  test("accepting nothing changes nothing", async () => {
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);
    const bundle = await buildBundle({ include: ["ranking"] });

    const result = await applyReview(await prepareReview(bundle), new Set());

    expect(result.accepted).toBe(0);
    expect(result.failed).toHaveLength(0);
  });
});

describe("the bundle covers the whole tournament", () => {
  test("carries tournament details, teams, the draw, lineups and payments", async () => {
    await writeCache(cacheKeys.tournamentState("tournament", "t1"), { name: "Kigali Open" });
    await writeCache(cacheKeys.tournamentState("team", "t1"), [{ team_id: "a" }]);
    await writeCache(cacheKeys.tournamentState("pairing", "t1"), [{ room_name: "Room 1" }]);
    await writeCache(cacheKeys.tournamentState("lineup", "t1"), [{ team_id: "a" }]);
    await writeCache(cacheKeys.tournamentState("payment", "t1"), [{ school_id: "sc1" }]);

    const bundle = await buildBundle({ tournamentId: "t1" });
    const types = new Set(bundle.entities.map((entity) => entity.type));

    expect(types).toContain("tournament");
    expect(types).toContain("team");
    expect(types).toContain("pairing");
    expect(types).toContain("lineup");
    expect(types).toContain("payment");
  });

  test("the draw travels with its rooms intact", async () => {
    await writeCache(cacheKeys.tournamentState("pairing", "t1"), [
      { room_name: "Room 1", proposition_team_id: "a", opposition_team_id: "b" },
    ]);

    const bundle = await buildBundle({ tournamentId: "t1", include: ["pairing"] });
    const draw = bundle.entities[0].payload as any[];

    expect(draw[0].room_name).toBe("Room 1");
    expect(draw[0].proposition_team_id).toBe("a");
  });

  test("finance can be withheld when sharing with someone who should not see it", async () => {
    await writeCache(cacheKeys.tournamentState("payment", "t1"), [{ amount: 50000 }]);
    await writeCache(cacheKeys.tournamentState("pairing", "t1"), [{ room_name: "Room 1" }]);

    const bundle = await buildBundle({
      tournamentId: "t1",
      include: ["pairing"],
    });

    expect(bundle.entities.some((entity) => entity.type === "payment")).toBe(false);
    expect(bundle.entities.some((entity) => entity.type === "pairing")).toBe(true);
  });

  test("a whole-tournament bundle is accepted and reviewable per item", async () => {
    await writeCache(cacheKeys.tournamentState("pairing", "t1"), [{ room_name: "Room 1" }]);
    await writeCache(cacheKeys.tournamentState("team", "t1"), [{ team_id: "a" }]);
    await writeCache(cacheKeys.leaderboard("student"), RANKINGS);

    const bundle = await buildBundle({ tournamentId: "t1" });

    expect(validateBundle(bundle, { tournamentId: "t1" }).valid).toBe(true);

    const review = await prepareReview(bundle);
    expect(review).toHaveLength(bundle.entities.length);
  });
});
