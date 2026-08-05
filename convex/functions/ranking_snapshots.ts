import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { isTournamentCountable } from "../lib/ranking_release";

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

/**
 * Recomputes league-wide standings and stores one row per entity.
 *
 * Two problems this solves. Leaderboards previously loaded every ballot in the
 * database on each read; they now read a single sorted row per entity. And
 * rank change had nothing to compare against, so it was fabricated; the
 * previous rank is carried forward here, making the delta real.
 */
export const rebuildSnapshots = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ students: number; schools: number }> => {
    const tournaments = (await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect());

    const countableForStudents = tournaments.filter((tournament) =>
      isTournamentCountable(tournament, "students", "student")
    );
    const countableForSchools = tournaments.filter((tournament) =>
      isTournamentCountable(tournament, "schools", "school_admin")
    );

    const studentTallies = new Map<string, Tally>();
    const schoolTallies = new Map<string, Tally>();

    // Scoped by tournament through the new index rather than reading every
    // ballot in the league.
    for (const tournament of countableForStudents) {
      const ballots = await ctx.db
        .query("judging_scores")
        .withIndex("by_tournament_id_submission_state", (q) =>
          q.eq("tournament_id", tournament._id).eq("submission_state", "submitted")
        )
        .collect();

      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament._id))
        .collect();

      const schoolByTeam = new Map(teams.map((team) => [team._id, team.school_id]));
      const countsForSchools = countableForSchools.some((t) => t._id === tournament._id);

      for (const ballot of ballots) {
        for (const speaker of ballot.speaker_scores) {
          const student = studentTallies.get(speaker.speaker_id) ?? emptyTally(speaker.speaker_id);
          student.total_points += speaker.total;
          student.scores_count += 1;
          student.tournaments.add(tournament._id);
          studentTallies.set(speaker.speaker_id, student);

          const schoolId = schoolByTeam.get(speaker.team_id);

          if (schoolId && countsForSchools) {
            const school = schoolTallies.get(schoolId) ?? emptyTally(schoolId);
            school.total_points += speaker.total;
            school.scores_count += 1;
            school.tournaments.add(tournament._id);
            schoolTallies.set(schoolId, school);
          }
        }
      }
    }

    const students = await writeSnapshots(ctx, "student", studentTallies);
    const schools = await writeSnapshots(ctx, "school", schoolTallies);

    return { students, schools };
  },
});

async function writeSnapshots(
  ctx: any,
  scope: Scope,
  tallies: Map<string, Tally>
): Promise<number> {
  const ranked = Array.from(tallies.values())
    .map((tally) => ({
      ...tally,
      average_points: tally.scores_count > 0 ? tally.total_points / tally.scores_count : 0,
    }))
    .sort(
      (a, b) => b.total_points - a.total_points || a.entity_id.localeCompare(b.entity_id)
    );

  const now = Date.now();

  const existing: Doc<"ranking_snapshots">[] = await ctx.db
    .query("ranking_snapshots")
    .withIndex("by_scope_rank", (q: any) => q.eq("scope", scope))
    .collect();

  const previousByEntity = new Map(existing.map((row) => [row.entity_id, row]));

  for (const [index, entry] of ranked.entries()) {
    const rank = index + 1;
    const previous = previousByEntity.get(entry.entity_id);

    const record = {
      scope,
      entity_id: entry.entity_id,
      rank,
      // Carried from the last run, which is what makes the delta real.
      previous_rank: previous?.rank,
      total_points: Math.round(entry.total_points * 100) / 100,
      average_points: Math.round(entry.average_points * 100) / 100,
      tournaments_count: entry.tournaments.size,
      computed_at: now,
    };

    if (previous) {
      await ctx.db.patch(previous._id, record);
    } else {
      await ctx.db.insert("ranking_snapshots", record);
    }
  }

  // An entity that no longer places should not linger at a stale rank.
  const rankedIds = new Set(ranked.map((entry) => entry.entity_id));

  for (const row of existing) {
    if (!rankedIds.has(row.entity_id)) {
      await ctx.db.delete(row._id);
    }
  }

  return ranked.length;
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
