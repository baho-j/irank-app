import { mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const createTournament = mutation({
  args: {
    admin_token: v.string(),
    name: v.string(),
    start_date: v.number(),
    end_date: v.number(),
    location: v.optional(v.string()),
    is_virtual: v.boolean(),
    league_id: v.optional(v.id("leagues")),
    format: v.union(
      v.literal("WorldSchools"),
      v.literal("BritishParliamentary"),
      v.literal("PublicForum"),
      v.literal("LincolnDouglas"),
      v.literal("OxfordStyle")
    ),
    coordinator_id: v.optional(v.id("users")),
    prelim_rounds: v.number(),
    elimination_rounds: v.number(),
    judges_per_debate: v.number(),
    team_size: v.number(),
    motions: v.optional(
      v.record(
        v.string(),
        v.object({
          motion: v.string(),
          round: v.number(),
          releaseTime: v.number(),
        })
      )
    ),
    speaking_times: v.any(),
    fee: v.optional(v.number()),
    fee_currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
    description: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("draft"),
      v.literal("published")
    ),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { admin_token, ...tournamentData } = args;

    if (!tournamentData.name.trim()) {
      throw new Error("Tournament name is required");
    }

    if (tournamentData.start_date >= tournamentData.end_date) {
      throw new Error("End date must be after start date");
    }

    if (tournamentData.start_date < Date.now()) {
      throw new Error("Start date cannot be in the past");
    }

    if (tournamentData.prelim_rounds < 1) {
      throw new Error("At least 1 preliminary round is required");
    }

    if (tournamentData.judges_per_debate < 1) {
      throw new Error("At least 1 judge per debate is required");
    }

    if (tournamentData.team_size < 1 || tournamentData.team_size > 5) {
      throw new Error("Team size must be between 1 and 5");
    }

    if (tournamentData.format === "WorldSchools" && tournamentData.team_size !== 3) {
      throw new Error("World Schools requires exactly 3 speakers per team");
    }

    if (tournamentData.league_id) {
      const league = await ctx.db.get(tournamentData.league_id);
      if (!league) {
        throw new Error("Selected league does not exist");
      }
    }

    if (tournamentData.coordinator_id) {
      const coordinator = await ctx.db.get(tournamentData.coordinator_id);
      if (!coordinator) {
        throw new Error("Selected coordinator does not exist");
      }
    }

    const existingTournament = await ctx.db
      .query("tournaments")
      .withSearchIndex("search_tournaments", (q) => q.search("name", tournamentData.name.trim()))
      .first();

    if (existingTournament && existingTournament.name === tournamentData.name.trim()) {
      throw new Error("A tournament with this name already exists");
    }

    const slug = generateSlug(tournamentData.name);

    const { motions, ...tournamentWithoutMotions } = tournamentData;

    const tournamentId = await ctx.db.insert("tournaments", {
      ...tournamentWithoutMotions,
      name: tournamentWithoutMotions.name.trim(),
      slug: slug,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    if (args.motions) {
      const roundDuration = 90;
      const breakBetweenRounds = 15;
      let currentTime = tournamentData.start_date + (30 * 60 * 1000);

      for (let i = 1; i <= tournamentData.prelim_rounds; i++) {
        const key = `preliminary_${i}`;
        const motion = args.motions[key];
        const isImpromptu = i === tournamentData.prelim_rounds;

        const startTime = currentTime;
        const endTime = currentTime + (roundDuration * 60 * 1000);

        await ctx.db.insert("rounds", {
          tournament_id: tournamentId,
          round_number: i,
          type: "preliminary",
          status: "pending",
          start_time: startTime,
          end_time: endTime,
          motion: motion?.motion || "",
          is_impromptu: isImpromptu,
          motion_released_at: isImpromptu ? undefined : (tournamentData.status === "published" ? Date.now() : undefined),
        });

        currentTime = endTime + (breakBetweenRounds * 60 * 1000);
      }

      for (let i = 1; i <= tournamentData.elimination_rounds; i++) {
        const key = `elimination_${i}`;
        const motion = args.motions[key];

        const startTime = currentTime;
        const endTime = currentTime + (roundDuration * 60 * 1000);

        await ctx.db.insert("rounds", {
          tournament_id: tournamentId,
          round_number: i,
          type: i === tournamentData.elimination_rounds ? "final" : "elimination",
          status: "pending",
          start_time: startTime,
          end_time: endTime,
          motion: motion?.motion || "",
          is_impromptu: false,
          motion_released_at: tournamentData.status === "published" ? Date.now() : undefined,
        });

        currentTime = endTime + (breakBetweenRounds * 60 * 1000);
      }
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_created",
      resource_type: "tournaments",
      resource_id: tournamentId,
      description: `Created tournament: ${tournamentData.name}`,
    });

    return { slug, success: true };
  },
});

export const updateTournament = mutation({
  args: {
    admin_token: v.string(),
    tournament_id: v.id("tournaments"),
    name: v.string(),
    start_date: v.number(),
    end_date: v.number(),
    location: v.optional(v.string()),
    is_virtual: v.boolean(),
    league_id: v.optional(v.id("leagues")),
    format: v.union(
      v.literal("WorldSchools"),
      v.literal("BritishParliamentary"),
      v.literal("PublicForum"),
      v.literal("LincolnDouglas"),
      v.literal("OxfordStyle")
    ),
    coordinator_id: v.optional(v.id("users")),
    prelim_rounds: v.number(),
    elimination_rounds: v.number(),
    judges_per_debate: v.number(),
    team_size: v.number(),
    motions: v.optional(
      v.record(
        v.string(),
        v.object({
          motion: v.string(),
          round: v.number(),
          releaseTime: v.number(),
        })
      )
    ),
    speaking_times: v.any(),
    fee: v.optional(v.number()),
    fee_currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
    description: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("inProgress"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { admin_token, tournament_id, motions, ...updateData } = args;

    const existingTournament = await ctx.db.get(tournament_id);
    if (!existingTournament) {
      throw new Error("Tournament not found");
    }

    if (!updateData.name.trim()) {
      throw new Error("Tournament name is required");
    }

    if (updateData.start_date >= updateData.end_date) {
      throw new Error("End date must be after start date");
    }

    if (updateData.team_size < 1 || updateData.team_size > 5) {
      throw new Error("Team size must be between 1 and 5");
    }

    if (updateData.format === "WorldSchools" && updateData.team_size !== 3) {
      throw new Error("World Schools requires exactly 3 speakers per team");
    }

    const duplicateTournament = await ctx.db
      .query("tournaments")
      .withSearchIndex("search_tournaments", (q) => q.search("name", updateData.name.trim()))
      .filter((q) => q.neq(q.field("_id"), tournament_id))
      .first();

    if (duplicateTournament && duplicateTournament.name === updateData.name.trim()) {
      throw new Error("A tournament with this name already exists");
    }

    if (updateData.status === "draft") {
      const teamsCount = await ctx.db
        .query("teams")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament_id))
        .collect()
        .then(teams => teams.length);

      if (teamsCount > 0) {
        throw new Error("Cannot change tournament to draft status when it has registered teams. Please remove all teams first.");
      }
    }

    let finalSlug = existingTournament.slug;
    if (updateData.name.trim() !== existingTournament.name) {
      const newSlug = generateSlug(updateData.name);

      const existingSlug = await ctx.db
        .query("tournaments")
        .withIndex("by_slug", (q) => q.eq("slug", newSlug))
        .filter((q) => q.neq(q.field("_id"), tournament_id))
        .first();

      if (existingSlug) {
        throw new Error("A tournament with a similar name already exists. Please choose a different name.");
      }

      finalSlug = newSlug;
    }

    if (updateData.league_id) {
      const league = await ctx.db.get(updateData.league_id);
      if (!league) {
        throw new Error("Selected league does not exist");
      }
    }

    if (updateData.coordinator_id) {
      const coordinator = await ctx.db.get(updateData.coordinator_id);
      if (!coordinator) {
        throw new Error("Selected coordinator does not exist");
      }
    }

    await ctx.db.patch(tournament_id, {
      ...updateData,
      name: updateData.name.trim(),
      slug: finalSlug,
      updated_at: Date.now(),
    });

    if (motions) {

      const existingRounds = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament_id))
        .collect();

      const currentPrelimCount = existingRounds.filter(r => r.type === "preliminary").length;
      const currentElimCount = existingRounds.filter(r => r.type === "elimination" || r.type === "final").length;

      if (currentPrelimCount !== updateData.prelim_rounds || currentElimCount !== updateData.elimination_rounds) {
        for (const round of existingRounds) {
          await ctx.db.delete(round._id);
        }

        const roundDuration = 90;
        const breakBetweenRounds = 15;
        let currentTime = updateData.start_date + (30 * 60 * 1000);

        for (let i = 1; i <= updateData.prelim_rounds; i++) {
          const key = `preliminary_${i}`;
          const motion = motions[key];
          const isImpromptu = i === updateData.prelim_rounds;

          const startTime = currentTime;
          const endTime = currentTime + (roundDuration * 60 * 1000);

          await ctx.db.insert("rounds", {
            tournament_id: tournament_id,
            round_number: i,
            type: "preliminary",
            status: "pending",
            start_time: startTime,
            end_time: endTime,
            motion: motion?.motion || "",
            is_impromptu: isImpromptu,
            motion_released_at: isImpromptu ? undefined : (updateData.status === "published" ? Date.now() : undefined),
          });

          currentTime = endTime + (breakBetweenRounds * 60 * 1000);
        }

        for (let i = 1; i <= updateData.elimination_rounds; i++) {
          const key = `elimination_${i}`;
          const motion = motions[key];

          const startTime = currentTime;
          const endTime = currentTime + (roundDuration * 60 * 1000);

          await ctx.db.insert("rounds", {
            tournament_id: tournament_id,
            round_number: i,
            type: i === updateData.elimination_rounds ? "final" : "elimination",
            status: "pending",
            start_time: startTime,
            end_time: endTime,
            motion: motion?.motion || "",
            is_impromptu: false,
            motion_released_at: updateData.status === "published" ? Date.now() : undefined,
          });

          currentTime = endTime + (breakBetweenRounds * 60 * 1000);
        }
      } else {
        for (const round of existingRounds) {
          const key = round.type === "preliminary"
            ? `preliminary_${round.round_number}`
            : `elimination_${round.round_number}`;

          const motion = motions[key];
          if (motion) {
            const isImpromptu = round.type === "preliminary" && round.round_number === updateData.prelim_rounds;

            await ctx.db.patch(round._id, {
              motion: motion.motion,
              is_impromptu: isImpromptu,
              motion_released_at: isImpromptu ? round.motion_released_at : (updateData.status === "published" ? Date.now() : round.motion_released_at),
              type: round.type === "elimination" && round.round_number === updateData.elimination_rounds ? "final" : round.type,
            });
          }
        }
      }
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_updated",
      resource_type: "tournaments",
      resource_id: tournament_id,
      description: `Updated tournament: ${updateData.name}`,
      previous_state: JSON.stringify({
        name: existingTournament.name,
        status: existingTournament.status,
        start_date: existingTournament.start_date,
        end_date: existingTournament.end_date,
      }),
      new_state: JSON.stringify({
        name: updateData.name,
        status: updateData.status,
        start_date: updateData.start_date,
        end_date: updateData.end_date,
      }),
    });

    return { slug: finalSlug,  success: true };
  },
});

export const deleteTournament = mutation({
  args: {
    admin_token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { tournament_id } = args;

    const tournament = await ctx.db.get(tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament_id))
      .first();

    if (teams) {
      throw new Error("Cannot delete tournament that has teams. Please remove all teams first.");
    }

    if (tournament.image) {
      try {
        await ctx.storage.delete(tournament.image);
        console.log("Tournament image deleted successfully");
      } catch (error) {
        console.error("Failed to delete tournament image:", error);
      }
    }
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament_id))
      .collect();

    for (const round of rounds) {
      await ctx.db.delete(round._id);
    }

    await ctx.db.delete(tournament_id);

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_deleted",
      resource_type: "tournaments",
      resource_id: tournament_id,
      description: `Deleted tournament: ${tournament.name}`,
      previous_state: JSON.stringify({
        name: tournament.name,
        status: tournament.status,
        league_id: tournament.league_id,
        image_deleted: !!tournament.image,
      }),
    });

    return { success: true };
  },
});

export const archiveTournament = mutation({
  args: {
    admin_token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { admin_token, tournament_id } = args;

    const tournament = await ctx.db.get(tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const previousStatus = tournament.status;

    await ctx.db.patch(tournament_id, {
      status: "cancelled",
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_updated",
      resource_type: "tournaments",
      resource_id: tournament_id,
      description: `Archived tournament: ${tournament.name}`,
      previous_state: JSON.stringify({ status: previousStatus }),
      new_state: JSON.stringify({ status: "cancelled" }),
    });

    return { success: true };
  },
});

export const bulkUpdateTournaments = mutation({
  args: {
    admin_token: v.string(),
    tournament_ids: v.array(v.id("tournaments")),
    action: v.union(
      v.literal("archive"),
      v.literal("delete"),
      v.literal("publish"),
      v.literal("cancel")
    ),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { admin_token, tournament_ids, action } = args;

    const results = [];

    for (const tournament_id of tournament_ids) {
      try {
        const tournament = await ctx.db.get(tournament_id);
        if (!tournament) {
          results.push({
            tournament_id,
            success: false,
            error: "Tournament not found",
          });
          continue;
        }

        if (action === "delete") {
          const teams = await ctx.db
            .query("teams")
            .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournament_id))
            .first();

          if (teams) {
            results.push({
              tournament_id,
              success: false,
              error: "Cannot delete tournament that has teams",
            });
            continue;
          }

          if (tournament.image) {
            try {
              await ctx.storage.delete(tournament.image);
            } catch (error) {
              console.log("Could not delete tournament image:", error);
            }
          }

          await ctx.db.delete(tournament_id);
        } else if (action === "archive" || action === "cancel") {
          await ctx.db.patch(tournament_id, {
            status: "cancelled",
            updated_at: Date.now(),
          });
        } else if (action === "publish") {
          await ctx.db.patch(tournament_id, {
            status: "published",
            updated_at: Date.now(),
          });
        }

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: sessionResult.user.id,
          action: action === "delete" ? "tournament_deleted" : "tournament_updated",
          resource_type: "tournaments",
          resource_id: tournament_id,
          description: `Bulk ${action} tournament: ${tournament.name}`,
        });

        results.push({
          tournament_id,
          success: true,
        });
      } catch (error: any) {
        results.push({
          tournament_id,
          success: false,
          error: error.message,
        });
      }
    }

    return { results };
  },
});

export const getTournamentRounds = query({
  args: { tournament_id: v.id("tournaments") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .order("asc")
      .collect();

    return rounds.sort((a, b) => {
      if (a.type === "preliminary" && b.type !== "preliminary") return -1;
      if (a.type !== "preliminary" && b.type === "preliminary") return 1;
      return a.round_number - b.round_number;
    });
  },
});


export const getAllTournamentVolunteers = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    if (sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const invitations = await ctx.db
      .query("tournament_invitations")
      .withIndex("by_tournament_id_target_type_status", (q) =>
        q.eq("tournament_id", args.tournament_id)
          .eq("target_type", "volunteer")
          .eq("status", "accepted")
      )
      .collect();

    const volunteers = await Promise.all(
      invitations.map(async (invitation) => {
        const volunteer = await ctx.db.get(invitation.target_id);
        if (!volunteer) return null;

        const school = volunteer.school_id ? await ctx.db.get(volunteer.school_id) : null;

        const debates = await ctx.db
          .query("debates")
          .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
          .collect();

        const judgedDebates = debates.filter(d => d.judges.includes(volunteer._id));

        const eliminationDebates = await Promise.all(
          judgedDebates.map(async (debate) => {
            const round = await ctx.db.get(debate.round_id);
            return round && round.round_number > tournament.prelim_rounds;
          })
        );

        const elimCount = eliminationDebates.filter(Boolean).length;

        const feedback = await ctx.db
          .query("judge_feedback")
          .withIndex("by_judge_id", (q) => q.eq("judge_id", volunteer._id))
          .filter((q) => q.eq(q.field("tournament_id"), args.tournament_id))
          .collect();

        const avgFeedbackScore = feedback.length > 0
          ? feedback.reduce((sum, f) => sum + (f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4, 0) / feedback.length
          : 3.0;

        const conflicts: Id<"teams">[] = [];

        if (volunteer.school_id) {
          const schoolTeams = await ctx.db
            .query("teams")
            .withIndex("by_tournament_id_school_id", (q) =>
              q.eq("tournament_id", args.tournament_id).eq("school_id", volunteer.school_id)
            )
            .collect();

          conflicts.push(...schoolTeams.filter(t => t.status === "active").map(t => t._id));
        }

        const poorFeedback = feedback.filter(f =>
          f.bias_detected === true ||
          ((f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4) < 2.0
        );

        poorFeedback.forEach(f => {
          if (f.team_id && !conflicts.includes(f.team_id)) {
            conflicts.push(f.team_id);
          }
        });

        return {
          _id: volunteer._id,
          name: volunteer.name,
          email: volunteer.email,
          school_id: volunteer.school_id,
          school_name: school?.name,
          total_debates_judged: judgedDebates.length,
          elimination_debates: elimCount,
          avg_feedback_score: avgFeedbackScore,
          conflicts,
          assignments_this_tournament: judgedDebates.length,
          cross_tournament_stats: {
            total_tournaments: 0,
            total_debates: 0,
            total_elimination_debates: 0,
            avg_feedback: 3.0,
            consistency_score: 1.0,
          },
        };
      })
    );

    const validVolunteers = volunteers.filter(Boolean) as any[];

    return validVolunteers.sort((a, b) => {

      const experienceA = a.total_debates_judged + (a.elimination_debates * 2);
      const experienceB = b.total_debates_judged + (b.elimination_debates * 2);

      if (experienceA !== experienceB) {
        return experienceB - experienceA;
      }

      return b.avg_feedback_score - a.avg_feedback_score;
    });
  },
});


export const getCoordinators = query({
  args: {
    admin_token: v.string(),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    let usersQuery = ctx.db.query("users");

    usersQuery = usersQuery
      .filter((q) => q.eq(q.field("status"), "active"))
      .filter((q) => q.eq(q.field("verified"), true))
      .filter((q) =>
        q.or(
          q.eq(q.field("role"), "admin"),
          q.eq(q.field("role"), "volunteer")
        )
      );

    if (args.search && args.search.trim()) {
      const searchTerm = args.search.toLowerCase();
      usersQuery = usersQuery.filter((q) =>
        q.or(
          q.eq(q.field("name"), searchTerm),
          q.eq(q.field("email"), searchTerm)
        )
      );
    }

    const limit = args.limit || 50;
    const users = await usersQuery.take(limit);

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const school = user.school_id ? await ctx.db.get(user.school_id) : null;
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          school_id: user.school_id,
          school_name: school?.name,
          school_type: school?.type,
          verified: user.verified,
          status: user.status,
        };
      })
    );

    const sortedUsers = enrichedUsers.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "admin" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return sortedUsers;
  },
});
/**
 * Releases an impromptu round's motion at the moment the tab team chooses,
 * and tells everyone who needs it. Motions must not be visible before this.
 */
export const releaseMotion = mutation({
  args: {
    token: v.string(),
    round_id: v.id("rounds"),
    /** Omit to release now; set a future time to schedule it. */
    release_at: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; release_at?: number }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const round = await ctx.db.get(args.round_id);

    if (!round) {
      throw new Error("Round not found");
    }

    const now = Date.now();

    if (round.motion_released_at && round.motion_released_at <= now) {
      throw new Error("This motion has already been released");
    }

    const releaseAt = args.release_at ?? now;

    if (releaseAt < now) {
      throw new Error("A motion cannot be released in the past");
    }

    await ctx.db.patch(args.round_id, { motion_released_at: releaseAt });

    // Scheduling the notification at the release moment is what makes every
    // room learn the motion at the same time.
    await ctx.scheduler.runAt(
      releaseAt,
      internal.functions.notification_emails.sendMotionReleasedEmails,
      { tournament_id: round.tournament_id, round_id: args.round_id }
    );

    return { success: true, release_at: releaseAt };
  },
});
