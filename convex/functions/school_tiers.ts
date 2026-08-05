import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { assignTiers, applyTierDamping, type TierCandidate } from "../../lib/ranking/tiers";
import { schoolScore } from "../../lib/ranking/scoring";
import { isTournamentCountable } from "../lib/ranking_release";

/**
 * Recomputes every school's tier from live data. Tiers are relative, so one
 * school's result can move another's band — there is no way to evaluate a
 * single school in isolation.
 */
export const recalculateTiers = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ evaluated: number; changed: number }> => {
    const schools = await ctx.db
      .query("schools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const tournaments = (await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect()).filter((tournament) =>
        isTournamentCountable(tournament, "schools", "school_admin")
      );

    const countableTournamentIds = new Set(tournaments.map((t) => t._id));

    const teams = (await ctx.db.query("teams").collect()).filter(
      (team) => countableTournamentIds.has(team.tournament_id) && team.status === "active"
    );

    const debates = (await ctx.db.query("debates").collect()).filter(
      (debate) =>
        countableTournamentIds.has(debate.tournament_id) && debate.status === "completed"
    );

    const components = schools.map((school) => {
      const schoolTeams = teams.filter((team) => team.school_id === school._id);
      const teamIds = new Set(schoolTeams.map((team) => team._id));

      const wins = debates.filter(
        (debate) => debate.winning_team_id && teamIds.has(debate.winning_team_id)
      ).length;

      const debatesPlayed = debates.filter(
        (debate) =>
          (debate.proposition_team_id && teamIds.has(debate.proposition_team_id)) ||
          (debate.opposition_team_id && teamIds.has(debate.opposition_team_id))
      ).length;

      const tournamentsAttended = new Set(schoolTeams.map((team) => team.tournament_id)).size;

      // Hosting is not tracked until the Phase 2 activity workflow exists, so
      // it contributes nothing rather than being guessed.
      return {
        school,
        raw: {
          win_rate: debatesPlayed > 0 ? wins / debatesPlayed : 0,
          tournaments_attended: tournamentsAttended,
          hosted: 0,
        },
      };
    });

    const maxAttendance = Math.max(
      1,
      ...components.map((entry) => entry.raw.tournaments_attended)
    );

    const candidates: Array<TierCandidate & {
      school: Doc<"schools">;
      performance: number;
      attendance: number;
      hosting: number;
    }> = components.map((entry) => {
      const performance = entry.raw.win_rate * 100;
      const attendance = (entry.raw.tournaments_attended / maxAttendance) * 100;
      const hosting = entry.raw.hosted;

      return {
        school_id: entry.school._id,
        score: schoolScore({ performance, attendance, hosting }),
        verified_activities: entry.raw.tournaments_attended,
        school: entry.school,
        performance,
        attendance,
        hosting,
      };
    });

    const assignments = assignTiers(candidates);
    const now = Date.now();
    let changed = 0;

    for (const assignment of assignments) {
      const candidate = candidates.find((c) => c.school_id === assignment.school_id)!;

      const existing = await ctx.db
        .query("school_tiers")
        .withIndex("by_school_id", (q) =>
          q.eq("school_id", assignment.school_id as Id<"schools">)
        )
        .first();

      const transition = applyTierDamping(
        existing
          ? {
            current: existing.tier,
            pending: existing.pending_tier,
            pending_count: existing.pending_count,
          }
          : null,
        assignment.tier
      );

      if (transition.changed) changed += 1;

      const record = {
        school_id: assignment.school_id as Id<"schools">,
        tier: transition.tier,
        pending_tier: transition.pending,
        pending_count: transition.pending_count,
        score: candidate.score,
        performance_score: Math.round(candidate.performance * 100) / 100,
        attendance_score: Math.round(candidate.attendance * 100) / 100,
        hosting_score: Math.round(candidate.hosting * 100) / 100,
        verified_activities: candidate.verified_activities,
        rank: assignment.rank,
        evaluated_at: now,
        changed_at: transition.changed ? now : existing?.changed_at,
      };

      if (existing) {
        await ctx.db.patch(existing._id, record);
      } else {
        await ctx.db.insert("school_tiers", record);
      }
    }

    return { evaluated: assignments.length, changed };
  },
});

export const getSchoolTier = query({
  args: {
    token: v.string(),
    school_id: v.id("schools"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const record = await ctx.db
      .query("school_tiers")
      .withIndex("by_school_id", (q) => q.eq("school_id", args.school_id))
      .first();

    if (!record) return null;

    return {
      tier: record.tier,
      rank: record.rank,
      score: record.score,
      components: {
        performance: record.performance_score,
        attendance: record.attendance_score,
        hosting: record.hosting_score,
      },
      /** A pending tier means the change is awaiting a second confirmation. */
      provisional_tier: record.pending_tier,
      evaluated_at: record.evaluated_at,
    };
  },
});

export const getTierTable = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const records = await ctx.db.query("school_tiers").withIndex("by_rank").collect();

    return await Promise.all(
      records.map(async (record) => {
        const school = await ctx.db.get(record.school_id);

        return {
          school_id: record.school_id,
          school_name: school?.name ?? "Unknown",
          tier: record.tier,
          rank: record.rank,
          score: record.score,
          provisional_tier: record.pending_tier,
        };
      })
    );
  },
});
