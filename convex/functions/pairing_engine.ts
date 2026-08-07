import { v } from "convex/values";
import { query } from "../_generated/server";
import { mutation } from "../lib/aggregates";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { generatePairings } from "../../lib/pairing/engine";
import { calculateBreak, seedBracket } from "../../lib/pairing/breaks";
import {
  buildPairingJudges,
  buildPairingTeams,
  inputsFingerprint,
} from "../lib/pairing_inputs";

async function requireAdmin(ctx: any, token: string) {
  const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
    token,
  });

  if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
    throw new Error("Admin access required");
  }

  return sessionResult.user;
}

/**
 * Generates a round's draw on the server and stores it.
 *
 * When a device paired offline it sends the draw it produced along with the
 * seed it used. The server re-runs the same algorithm over its own data and
 * accepts the draw only if it matches, so a device can pair without
 * connectivity but cannot decide the draw unilaterally.
 */
export const generateRound = mutation({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.number(),
    seed: v.optional(v.number()),
    /** A draw already produced offline, for the server to verify. */
    client_draw: v.optional(v.array(v.object({
      room_name: v.string(),
      proposition_team_id: v.union(v.id("teams"), v.null()),
      opposition_team_id: v.union(v.id("teams"), v.null()),
      is_bye: v.boolean(),
    }))),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    debates: number;
    warnings: string[];
    verified: boolean;
  }> => {
    const user = await requireAdmin(ctx, args.token);

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) throw new Error("Tournament not found");

    const teams = await buildPairingTeams(ctx, args.tournament_id, args.round_number);
    const judges = await buildPairingJudges(ctx, args.tournament_id);

    const stage = args.round_number <= tournament.prelim_rounds ? "prelim" : "elim";
    const seed = args.seed ?? args.round_number * 7919 + teams.length;

    const pool =
      stage === "elim"
        ? teams.filter((team) =>
          calculateBreak(teams).breaking.some((entry) => entry.team_id === team.team_id)
        )
        : teams;

    const result = generatePairings({
      teams: pool,
      judges,
      rooms: Array.from({ length: Math.ceil(pool.length / 2) }, (_, index) => ({
        name: `Room ${index + 1}`,
      })),
      round_number: args.round_number,
      stage,
      judges_per_debate: tournament.judges_per_debate,
      seed,
    });

    let verified = true;

    if (args.client_draw) {
      const canonical = (draw: Array<{ proposition_team_id: unknown; opposition_team_id: unknown }>) =>
        draw
          .map((entry) =>
            [entry.proposition_team_id, entry.opposition_team_id].filter(Boolean).sort().join("+")
          )
          .sort()
          .join("|");

      verified = canonical(args.client_draw) === canonical(result.debates);

      if (!verified) {
        throw new Error(
          "This draw does not match what the server computes from the same teams. Regenerate it before saving."
        );
      }
    }

    const existingRound = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id_round_number", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number)
      )
      .first();

    let roundId: Id<"rounds">;

    if (existingRound) {
      if (existingRound.status === "completed") {
        throw new Error("This round is complete and cannot be re-paired.");
      }

      roundId = existingRound._id;

      const stale = await ctx.db
        .query("debates")
        .withIndex("by_round_id", (q) => q.eq("round_id", roundId))
        .collect();

      for (const debate of stale) {
        await ctx.db.delete(debate._id);
      }
    } else {
      roundId = await ctx.db.insert("rounds", {
        tournament_id: args.tournament_id,
        round_number: args.round_number,
        type: stage === "prelim" ? "preliminary" : "elimination",
        status: "pending",
        start_time: Date.now(),
        end_time: Date.now() + 3600000,
        motion: "",
        is_impromptu: false,
      });
    }

    const now = Date.now();

    for (const debate of result.debates) {
      await ctx.db.insert("debates", {
        round_id: roundId,
        tournament_id: args.tournament_id,
        room_name: debate.room_name,
        proposition_team_id: (debate.proposition_team_id ?? undefined) as Id<"teams"> | undefined,
        opposition_team_id: (debate.opposition_team_id ?? undefined) as Id<"teams"> | undefined,
        judges: debate.judges as Id<"users">[],
        head_judge_id: debate.head_judge_id as Id<"users"> | undefined,
        status: "pending",
        is_public_speaking: false,
        is_bye: debate.is_bye,
        poi_count: 0,
        created_at: now,
      });
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: user.id,
      action: "debate_created",
      resource_type: "rounds",
      resource_id: roundId,
      description: `Paired round ${args.round_number} (${result.debates.length} rooms, fingerprint ${inputsFingerprint(pool)})`,
    });

    return {
      success: true,
      debates: result.debates.length,
      warnings: result.warnings,
      verified,
    };
  },
});

export const getBreak = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const teams = await buildPairingTeams(ctx, args.tournament_id);
    const result = calculateBreak(teams, args.size);

    const named = await Promise.all(
      result.entries.map(async (entry) => {
        const team = await ctx.db.get(entry.team_id as Id<"teams">);

        return { ...entry, team_name: team?.name ?? "Unknown team" };
      })
    );

    return {
      entries: named,
      size: result.size,
      needs_review: result.needs_review,
      bracket: seedBracket(result.breaking),
    };
  },
});
