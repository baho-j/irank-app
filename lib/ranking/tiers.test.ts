import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { applyTierDamping, assignTiers, type TierCandidate } from "./tiers";
import { ELITE_MIN_ACTIVITIES, TIER_LABELS } from "./config";

function league(size: number, activities = 10): TierCandidate[] {
  return Array.from({ length: size }, (_, index) => ({
    school_id: `s${index.toString().padStart(3, "0")}`,
    score: 100 - index,
    verified_activities: activities,
  }));
}

const tierOf = (assignments: ReturnType<typeof assignTiers>, id: string) =>
  assignments.find((a) => a.school_id === id)?.tier;

describe("tier bands", () => {
  test("a twenty-school league splits 10 / 25 / 40 / rest", () => {
    const assignments = assignTiers(league(20));

    const counts = assignments.reduce<Record<string, number>>((acc, a) => {
      acc[a.tier] = (acc[a.tier] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.elite).toBe(2);
    expect(counts.advanced).toBe(5);
    expect(counts.developing).toBe(8);
    expect(counts.beginner).toBe(5);
  });

  test("the top school is elite and the bottom is beginner", () => {
    const assignments = assignTiers(league(100));

    expect(tierOf(assignments, "s000")).toBe("elite");
    expect(tierOf(assignments, "s099")).toBe("beginner");
  });

  test("every school is assigned a tier", () => {
    const assignments = assignTiers(league(37));

    expect(assignments).toHaveLength(37);
    expect(assignments.every((a) => a.tier in TIER_LABELS)).toBe(true);
  });

  test("an empty league produces no assignments", () => {
    expect(assignTiers([])).toEqual([]);
  });

  test("a single school is elite when it has the activity to justify it", () => {
    expect(assignTiers(league(1))[0].tier).toBe("elite");
  });

  test("tiers are relative, so a school can drop as others improve", () => {
    const before = assignTiers(league(10));
    const after = assignTiers([
      ...league(10),
      ...Array.from({ length: 10 }, (_, i) => ({
        school_id: `new${i}`,
        score: 200 - i,
        verified_activities: 10,
      })),
    ]);

    expect(tierOf(before, "s000")).toBe("elite");
    expect(tierOf(after, "s000")).not.toBe("elite");
  });
});

describe("elite activity floor", () => {
  test("a school without enough verified activity cannot be elite", () => {
    const candidates = league(20);
    candidates[0].verified_activities = ELITE_MIN_ACTIVITIES - 1;

    expect(tierOf(assignTiers(candidates), "s000")).toBe("advanced");
  });

  test("exactly the minimum qualifies", () => {
    const candidates = league(20);
    candidates[0].verified_activities = ELITE_MIN_ACTIVITIES;

    expect(tierOf(assignTiers(candidates), "s000")).toBe("elite");
  });

  test("the floor does not affect lower tiers", () => {
    const candidates = league(20).map((c) => ({ ...c, verified_activities: 0 }));
    const assignments = assignTiers(candidates);

    expect(tierOf(assignments, "s010")).toBe("developing");
    expect(assignments.some((a) => a.tier === "elite")).toBe(false);
  });
});

describe("ties", () => {
  test("schools on the same score share a rank and a tier", () => {
    const assignments = assignTiers([
      { school_id: "a", score: 90, verified_activities: 10 },
      { school_id: "b", score: 90, verified_activities: 10 },
      { school_id: "c", score: 50, verified_activities: 10 },
      { school_id: "d", score: 40, verified_activities: 10 },
    ]);

    const a = assignments.find((x) => x.school_id === "a")!;
    const b = assignments.find((x) => x.school_id === "b")!;

    expect(a.rank).toBe(b.rank);
    expect(a.tier).toBe(b.tier);
  });

  test("ordering does not depend on input order", () => {
    const candidates = league(15);
    const forwards = assignTiers(candidates).map((a) => a.school_id);
    const backwards = assignTiers([...candidates].reverse()).map((a) => a.school_id);

    expect(forwards).toEqual(backwards);
  });
});

describe("tier damping", () => {
  test("a school with no history takes its evaluated tier immediately", () => {
    const result = applyTierDamping(null, "advanced");

    expect(result.tier).toBe("advanced");
    expect(result.changed).toBe(true);
    expect(result.provisional).toBe(false);
  });

  test("one evaluation at a new tier does not move the school", () => {
    const result = applyTierDamping({ current: "developing" }, "advanced");

    expect(result.tier).toBe("developing");
    expect(result.pending).toBe("advanced");
    expect(result.changed).toBe(false);
    expect(result.provisional).toBe(true);
  });

  test("two consecutive evaluations commit the change", () => {
    const first = applyTierDamping({ current: "developing" }, "advanced");
    const second = applyTierDamping(
      { current: "developing", pending: first.pending, pending_count: first.pending_count },
      "advanced"
    );

    expect(second.tier).toBe("advanced");
    expect(second.changed).toBe(true);
    expect(second.provisional).toBe(false);
  });

  test("a school that bounces back resets the streak", () => {
    const first = applyTierDamping({ current: "developing" }, "advanced");
    const reverted = applyTierDamping(
      { current: "developing", pending: first.pending, pending_count: first.pending_count },
      "developing"
    );

    expect(reverted.tier).toBe("developing");
    expect(reverted.pending_count).toBe(0);
    expect(reverted.provisional).toBe(false);
  });

  test("a different pending tier restarts the count rather than continuing it", () => {
    const first = applyTierDamping({ current: "beginner" }, "developing");
    const switched = applyTierDamping(
      { current: "beginner", pending: first.pending, pending_count: first.pending_count },
      "advanced"
    );

    expect(switched.pending).toBe("advanced");
    expect(switched.pending_count).toBe(1);
    expect(switched.changed).toBe(false);
  });

  test("staying put reports no change", () => {
    const result = applyTierDamping({ current: "elite" }, "elite");

    expect(result.changed).toBe(false);
    expect(result.provisional).toBe(false);
  });
});

describe("properties", () => {
  test("tier bands never overlap: a higher score never gets a lower tier", () => {
    const order = { elite: 0, advanced: 1, developing: 2, beginner: 3 };

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 2, maxLength: 60 }),
        (scores) => {
          const assignments = assignTiers(
            scores.map((score, index) => ({
              school_id: `s${index}`,
              score,
              verified_activities: 10,
            }))
          );

          const byScore = [...assignments].sort((a, b) => a.rank - b.rank);

          return byScore.every(
            (entry, index) =>
              index === 0 || order[entry.tier] >= order[byScore[index - 1].tier]
          );
        }
      )
    );
  });

  test("every school receives exactly one assignment", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 80 }), (size) => {
        const assignments = assignTiers(league(size));
        return (
          assignments.length === size &&
          new Set(assignments.map((a) => a.school_id)).size === size
        );
      })
    );
  });
});
