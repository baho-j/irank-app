import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { isTournamentCountable } from "../lib/ranking_release";
import { rankingPool } from "../lib/pools";

type Scope = "student" | "school" | "volunteer";

/**
 * Rebuilds league standings by fanning out over tournaments.
 *
 * The previous rebuild walked every completed tournament inside one mutation,
 * collecting all ballots and teams for each. That works today and stops working
 * as the league accumulates seasons, because it is one transaction whose size
 * grows without bound.
 *
 * Now each tournament is tallied in its own transaction and staged to
 * `ranking_tallies`. The pool reports when the last one lands, and the merge
 * that follows reads only those small rows to produce the ranked snapshot.
 */
export const startRebuild = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ run_id: string; tournaments: number }> => {
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const countable = tournaments.filter(
      (tournament) =>
        isTournamentCountable(tournament, "students", "student") ||
        isTournamentCountable(tournament, "schools", "school_admin")
    );

    // Identifies this run's staged rows, so a rebuild starting while another is
    // still draining cannot read the other's partial tallies.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (countable.length === 0) {
      await ctx.runMutation(internal.functions.ranking_rebuild.mergeTallies, {
        run_id: runId,
      });

      return { run_id: runId, tournaments: 0 };
    }

    // Tracks how many tallies are still outstanding. Jobs run concurrently, so
    // the one enqueued last is not the one that finishes last; the merge has to
    // wait on a count, not on position in the queue.
    await ctx.db.insert("ranking_runs", {
      run_id: runId,
      outstanding: countable.length,
      started_at: Date.now(),
    });

    for (const tournament of countable) {
      await rankingPool.enqueueMutation(
        ctx,
        internal.functions.ranking_rebuild.tallyTournament,
        { run_id: runId, tournament_id: tournament._id },
        {
          onComplete: internal.functions.ranking_rebuild.onTallyComplete,
          context: { run_id: runId },
        }
      );
    }

    return { run_id: runId, tournaments: countable.length };
  },
});

export const tallyTournament = internalMutation({
  args: {
    run_id: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<{ rows: number }> => {
    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) return { rows: 0 };

    const countsForStudents = isTournamentCountable(tournament, "students", "student");
    const countsForSchools = isTournamentCountable(tournament, "schools", "school_admin");

    if (!countsForStudents && !countsForSchools) return { rows: 0 };

    const ballots = await ctx.db
      .query("judging_scores")
      .withIndex("by_tournament_id_submission_state", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("submission_state", "submitted")
      )
      .collect();

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const schoolByTeam = new Map(teams.map((team) => [team._id, team.school_id]));

    const students = new Map<string, { total: number; count: number }>();
    const schools = new Map<string, { total: number; count: number }>();

    for (const ballot of ballots) {
      for (const speaker of ballot.speaker_scores) {
        if (countsForStudents) {
          const entry = students.get(speaker.speaker_id) ?? { total: 0, count: 0 };
          entry.total += speaker.total;
          entry.count += 1;
          students.set(speaker.speaker_id, entry);
        }

        const schoolId = schoolByTeam.get(speaker.team_id);

        if (schoolId && countsForSchools) {
          const entry = schools.get(schoolId) ?? { total: 0, count: 0 };
          entry.total += speaker.total;
          entry.count += 1;
          schools.set(schoolId, entry);
        }
      }
    }

    let rows = 0;

    for (const [scope, tallies] of [
      ["student", students],
      ["school", schools],
    ] as const) {
      for (const [entityId, entry] of tallies) {
        await ctx.db.insert("ranking_tallies", {
          run_id: args.run_id,
          scope,
          entity_id: entityId,
          tournament_id: args.tournament_id,
          total_points: entry.total,
          scores_count: entry.count,
        });
        rows += 1;
      }
    }

    return { rows };
  },
});

/**
 * Called for every tally, whether it succeeded, failed or was cancelled. The
 * merge runs when the last one reports in, so a tournament that failed to tally
 * cannot leave the rebuild waiting forever.
 */
export const onTallyComplete = internalMutation({
  args: {
    workId: v.string(),
    context: v.any(),
    result: v.any(),
  },
  handler: async (ctx, args): Promise<null> => {
    const runId = args.context.run_id as string;

    const run = await ctx.db
      .query("ranking_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", runId))
      .first();

    if (!run) return null;

    const outstanding = run.outstanding - 1;

    if (outstanding > 0) {
      await ctx.db.patch(run._id, { outstanding });
      return null;
    }

    await ctx.db.delete(run._id);
    await ctx.runMutation(internal.functions.ranking_rebuild.mergeTallies, {
      run_id: runId,
    });

    return null;
  },
});

export const mergeTallies = internalMutation({
  args: { run_id: v.string() },
  handler: async (ctx, args): Promise<{ students: number; schools: number }> => {
    const staged = await ctx.db
      .query("ranking_tallies")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .collect();

    const byScope = new Map<Scope, Map<string, Combined>>();

    for (const row of staged) {
      const scopeMap = byScope.get(row.scope) ?? new Map<string, Combined>();
      const entry = scopeMap.get(row.entity_id) ?? {
        total_points: 0,
        scores_count: 0,
        tournaments: new Set<string>(),
      };

      entry.total_points += row.total_points;
      entry.scores_count += row.scores_count;
      entry.tournaments.add(row.tournament_id);

      scopeMap.set(row.entity_id, entry);
      byScope.set(row.scope, scopeMap);
    }

    const students = await writeSnapshots(ctx, "student", byScope.get("student") ?? new Map());
    const schools = await writeSnapshots(ctx, "school", byScope.get("school") ?? new Map());

    for (const row of staged) {
      await ctx.db.delete(row._id);
    }

    return { students, schools };
  },
});

interface Combined {
  total_points: number;
  scores_count: number;
  tournaments: Set<string>;
}

async function writeSnapshots(
  ctx: any,
  scope: Scope,
  tallies: Map<string, Combined>
): Promise<number> {
  const ranked = Array.from(tallies.entries())
    .map(([entity_id, tally]) => ({
      entity_id,
      total_points: tally.total_points,
      average_points: tally.scores_count > 0 ? tally.total_points / tally.scores_count : 0,
      tournaments_count: tally.tournaments.size,
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
    const previous = previousByEntity.get(entry.entity_id);

    const record = {
      scope,
      entity_id: entry.entity_id,
      rank: index + 1,
      // Carried from the last run, which is what makes the delta real.
      previous_rank: previous?.rank,
      total_points: Math.round(entry.total_points * 100) / 100,
      average_points: Math.round(entry.average_points * 100) / 100,
      tournaments_count: entry.tournaments_count,
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

/**
 * Clears tallies from runs that never completed, so a rebuild interrupted
 * mid-fan-out does not leave rows behind for ever.
 */
export const cleanupStaleTallies = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ removed: number }> => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const stale = await ctx.db
      .query("ranking_tallies")
      .filter((q) => q.lt(q.field("_creationTime"), cutoff))
      .collect();

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    const abandoned = await ctx.db
      .query("ranking_runs")
      .filter((q) => q.lt(q.field("started_at"), cutoff))
      .collect();

    for (const run of abandoned) {
      await ctx.db.delete(run._id);
    }

    return { removed: stale.length + abandoned.length };
  },
});
