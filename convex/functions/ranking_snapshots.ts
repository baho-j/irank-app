import { v } from "convex/values";
import { query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

type Scope = "student" | "school" | "volunteer";

interface Tally {
  entity_id: string;
  total_points: number;
  scores_count: number;
  tournaments: Set<string>;
}

function emptyTally(entity_id: string): Tally {
  return { entity_id, total_points: 0, scores_count: 0, tournaments: new Set() };
}

function toLeaderboardRow(row: Doc<"ranking_snapshots">) {
  return {
    entity_id: row.entity_id,
    rank: row.rank,
    totalPoints: row.total_points,
    avgPoints: row.average_points,
    tournamentsCount: row.tournaments_count,
    /** Positive means the entity climbed since the previous computation. */
    rankChange: row.previous_rank ? row.previous_rank - row.rank : 0,
  };
}

export const getLeaderboard = query({
  args: {
    token: v.string(),
    scope: v.union(v.literal("student"), v.literal("school"), v.literal("volunteer")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const rows = await ctx.db
      .query("ranking_snapshots")
      .withIndex("by_scope_rank", (q) => q.eq("scope", args.scope))
      .take(args.limit ?? 10);

    return await Promise.all(
      rows.map(async (row) => {
        const base = toLeaderboardRow(row);

        if (args.scope === "student") {
          const student = await ctx.db.get(row.entity_id as Id<"users">);
          return { ...base, name: student?.name ?? "Unknown", profile_image: student?.profile_image };
        }

        const school = await ctx.db.get(row.entity_id as Id<"schools">);
        return { ...base, name: school?.name ?? "Unknown" };
      })
    );
  },
});

export const getMyRank = query({
  args: {
    token: v.string(),
    scope: v.union(v.literal("student"), v.literal("school"), v.literal("volunteer")),
    entity_id: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const row = await ctx.db
      .query("ranking_snapshots")
      .withIndex("by_scope_entity", (q) =>
        q.eq("scope", args.scope).eq("entity_id", args.entity_id)
      )
      .first();

    if (!row) {
      return { rank: null, rankChange: 0, totalEntities: 0 };
    }

    const total = (await ctx.db
      .query("ranking_snapshots")
      .withIndex("by_scope_rank", (q) => q.eq("scope", args.scope))
      .collect()).length;

    return { ...toLeaderboardRow(row), totalEntities: total };
  },
});
