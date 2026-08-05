import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { visibleMotion } from "../lib/motion_release";
import { paginationOptsValidator } from "convex/server";

interface TeamPairingData {
  _id: Id<"teams">;
  name: string;
  school_id?: Id<"schools">;
  school_name?: string;
  members: Id<"users">[];
  status: string;
  payment_status: string;
  side_history: ('proposition' | 'opposition')[];
  opponents_faced: Id<"teams">[];
  wins: number;
  total_points: number;
  bye_rounds: number[];
  performance_score: number;
  cross_tournament_performance: {
    total_tournaments: number;
    total_wins: number;
    total_debates: number;
    avg_performance: number;
  };
}

interface JudgePairingData {
  _id: Id<"users">;
  name: string;
  email: string;
  school_id?: Id<"schools">;
  school_name?: string;
  total_debates_judged: number;
  elimination_debates: number;
  avg_feedback_score: number;
  conflicts: Id<"teams">[];
  assignments_this_tournament: number;
  cross_tournament_stats: {
    total_tournaments: number;
    total_debates: number;
    total_elimination_debates: number;
    avg_feedback: number;
    consistency_score: number;
  };
}

interface PairingConflict {
  type: 'repeat_opponent' | 'same_school' | 'side_imbalance' | 'judge_conflict' | 'bye_violation' | 'feedback_conflict';
  description: string;
  severity: 'warning' | 'error';
  team_ids?: Id<"teams">[];
  judge_ids?: Id<"users">[];
}

export const getTournamentPairingData = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const league = tournament.league_id ? await ctx.db.get(tournament.league_id) : null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id_status", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("status", "active")
      )
      .collect();

    const invitations = await ctx.db
      .query("tournament_invitations")
      .withIndex("by_tournament_id_target_type_status", (q) =>
        q.eq("tournament_id", args.tournament_id)
          .eq("target_type", "volunteer")
          .eq("status", "accepted")
      )
      .collect();

    const judgeIds = invitations.map(inv => inv.target_id);
    const judges = await Promise.all(
      judgeIds.map(id => ctx.db.get(id))
    );

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const debates = await ctx.db
      .query("debates")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const judgingScores = await ctx.db.query("judging_scores").collect();
    const judgeFeedback = await ctx.db.query("judge_feedback").collect();

    // Enhanced conflict detection for judges
    const enrichedJudges: JudgePairingData[] = await Promise.all(
      judges.filter(Boolean).map(async (judge) => {
        const school = judge!.school_id ? await ctx.db.get(judge!.school_id) : null;

        const conflicts: Id<"teams">[] = [];

        // Add school conflicts
        if (judge!.school_id) {
          teams.filter(t => t.school_id === judge!.school_id)
            .forEach(t => conflicts.push(t._id));
        }

        // Add feedback conflicts with improved detection
        const poorFeedback = judgeFeedback.filter(f =>
          f.judge_id === judge!._id &&
          f.tournament_id === args.tournament_id && // Only current tournament
          (f.bias_detected === true ||
            ((f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4) < 2.0) // Stricter threshold
        );

        poorFeedback.forEach(f => {
          if (f.team_id && !conflicts.includes(f.team_id)) {
            conflicts.push(f.team_id);
          }
        });

        const totalDebatesJudged = debates.filter(d => d.judges.includes(judge!._id)).length;

        const eliminationDebates = debates.filter(d => {
          const round = rounds.find(r => r._id === d.round_id);
          const isElim = round && round.round_number > tournament.prelim_rounds;
          return isElim && d.judges.includes(judge!._id);
        }).length;

        const judgeFeedbackForJudge = judgeFeedback.filter(f =>
          f.judge_id === judge!._id && f.tournament_id === args.tournament_id
        );

        const avgFeedbackScore = judgeFeedbackForJudge.length > 0
          ? judgeFeedbackForJudge.reduce((sum, f) => sum + (f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4, 0) / judgeFeedbackForJudge.length
          : 3.0;

        return {
          _id: judge!._id,
          name: judge!.name,
          email: judge!.email,
          school_id: judge!.school_id,
          school_name: school?.name,
          total_debates_judged: totalDebatesJudged,
          elimination_debates: eliminationDebates,
          avg_feedback_score: avgFeedbackScore,
          conflicts,
          assignments_this_tournament: totalDebatesJudged,
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

    // Enhanced team data processing
    const enrichedTeams: TeamPairingData[] = await Promise.all(
      teams.map(async (team) => {
        const school = team.school_id ? await ctx.db.get(team.school_id) : null;

        const teamDebates = debates
          .filter(d => d.proposition_team_id === team._id || d.opposition_team_id === team._id)
          .sort((a, b) => {
            const roundA = rounds.find(r => r._id === a.round_id)?.round_number || 0;
            const roundB = rounds.find(r => r._id === b.round_id)?.round_number || 0;
            return roundA - roundB;
          });

        const sideHistory: ('proposition' | 'opposition')[] = teamDebates.map(d =>
          d.proposition_team_id === team._id ? 'proposition' : 'opposition'
        );

        const opponentsFaced: Id<"teams">[] = [];
        teamDebates.forEach(d => {
          if (d.proposition_team_id === team._id && d.opposition_team_id) {
            opponentsFaced.push(d.opposition_team_id);
          } else if (d.opposition_team_id === team._id && d.proposition_team_id) {
            opponentsFaced.push(d.proposition_team_id);
          }
        });

        const byeRounds = teamDebates
          .filter(d => d.is_public_speaking)
          .map(d => {
            const round = rounds.find(r => r._id === d.round_id);
            return round?.round_number || 0;
          });

        let wins = 0;
        let totalPoints = 0;

        teamDebates.forEach(debate => {
          if (debate.status === "completed" && debate.winning_team_id === team._id) {
            wins++;
          }

          if (debate.proposition_team_id === team._id && debate.proposition_team_points) {
            totalPoints += debate.proposition_team_points;
          } else if (debate.opposition_team_id === team._id && debate.opposition_team_points) {
            totalPoints += debate.opposition_team_points;
          }
        });

        return {
          _id: team._id,
          name: team.name,
          school_id: team.school_id,
          school_name: school?.name,
          members: team.members,
          status: team.status,
          payment_status: team.payment_status,
          side_history: sideHistory,
          opponents_faced: opponentsFaced,
          wins,
          total_points: totalPoints,
          bye_rounds: byeRounds,
          performance_score: wins * 100 + totalPoints,
          cross_tournament_performance: {
            total_tournaments: 0,
            total_wins: 0,
            total_debates: 0,
            avg_performance: 0,
          },
        };
      })
    );

    const currentRound = args.round_number || (rounds.length + 1);

    return {
      tournament,
      teams: enrichedTeams,
      judges: enrichedJudges,
      rounds: rounds.sort((a, b) => a.round_number - b.round_number),
      debates,
      current_round: currentRound,
      pairing_method: currentRound <= 5 ? "fold" : "swiss",
      can_generate_all_prelims: tournament.prelim_rounds <= 5,
    };
  },
});

export const getTournamentPairings = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.optional(v.number()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid) {
      throw new Error("Authentication required");
    }

    let rounds;
    if (args.round_number) {
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id_round_number", (q) =>
          q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number as number)
        )
        .first();
      rounds = round ? [round] : [];
    } else {
      rounds = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
        .collect();
    }

    if (rounds.length === 0) {
      return {
        page: [],
        isDone: true,
        continueCursor: null
      };
    }

    const enrichedRounds = await Promise.all(
      rounds.map(async (round) => {
        // Get debates with pagination support
        let debatesQuery = ctx.db
          .query("debates")
          .withIndex("by_round_id", (q) => q.eq("round_id", round._id));

        // Apply search filter if provided
        if (args.search) {
          const searchLower = args.search.toLowerCase();
          debatesQuery = debatesQuery.filter((q) => {
            return q.or(
              q.eq(q.field("room_name"), args.search),
              // We'll need to do team/judge name filtering after enrichment
              // since we can't filter on joined data directly
            );
          });
        }

        const paginatedDebates = await debatesQuery.paginate(args.paginationOpts);

        const enrichedDebates = await Promise.all(
          paginatedDebates.page.map(async (debate) => {
            const propTeam = debate.proposition_team_id ?
              await ctx.db.get(debate.proposition_team_id) : null;
            const oppTeam = debate.opposition_team_id ?
              await ctx.db.get(debate.opposition_team_id) : null;

            const judges = await Promise.all(
              debate.judges.map(id => ctx.db.get(id))
            );

            const headJudge = debate.head_judge_id ?
              await ctx.db.get(debate.head_judge_id) : null;

            const propSchool = propTeam?.school_id ? await ctx.db.get(propTeam.school_id) : null;
            const oppSchool = oppTeam?.school_id ? await ctx.db.get(oppTeam.school_id) : null;

            const judgeDetails = await Promise.all(
              judges.filter(Boolean).map(async (judge) => {
                const school = judge!.school_id ? await ctx.db.get(judge!.school_id) : null;
                return {
                  ...judge!,
                  school: school ? {
                    _id: school._id,
                    name: school.name,
                    type: school.type,
                  } : null,
                };
              })
            );

            // Enhanced conflict detection for display
            const conflicts: PairingConflict[] = [];

            // Check for judge-team school conflicts
            judgeDetails.forEach(judge => {
              if (judge.school_id) {
                // For public speaking, only check against the participating team
                if (debate.is_public_speaking) {
                  if (propTeam?.school_id === judge.school_id) {
                    conflicts.push({
                      type: 'judge_conflict',
                      description: `Judge ${judge.name} is from the same school as the participating team`,
                      severity: 'error',
                      judge_ids: [judge._id],
                      team_ids: propTeam ? [propTeam._id] : undefined,
                    });
                  }
                } else {
                  // For regular debates, check both teams
                  if (propTeam?.school_id === judge.school_id) {
                    conflicts.push({
                      type: 'judge_conflict',
                      description: `Judge ${judge.name} is from the same school as proposition team`,
                      severity: 'error',
                      judge_ids: [judge._id],
                      team_ids: propTeam ? [propTeam._id] : undefined,
                    });
                  }
                  if (oppTeam?.school_id === judge.school_id) {
                    conflicts.push({
                      type: 'judge_conflict',
                      description: `Judge ${judge.name} is from the same school as opposition team`,
                      severity: 'error',
                      judge_ids: [judge._id],
                      team_ids: oppTeam ? [oppTeam._id] : undefined,
                    });
                  }
                }
              }
            });

            // Check for same school teams (only for regular debates)
            if (!debate.is_public_speaking && propTeam && oppTeam &&
              propTeam.school_id && propTeam.school_id === oppTeam.school_id) {
              conflicts.push({
                type: 'same_school',
                description: `Both teams are from the same school`,
                severity: 'warning',
                team_ids: [propTeam._id, oppTeam._id],
              });
            }

            return {
              ...debate,
              proposition_team: propTeam ? {
                ...propTeam,
                school: propSchool ? {
                  _id: propSchool._id,
                  name: propSchool.name,
                  type: propSchool.type,
                } : null,
              } : null,
              opposition_team: oppTeam ? {
                ...oppTeam,
                school: oppSchool ? {
                  _id: oppSchool._id,
                  name: oppSchool.name,
                  type: oppSchool.type,
                } : null,
              } : null,
              judge_details: judgeDetails,
              head_judge: headJudge ? {
                ...headJudge,
                school: headJudge.school_id ? await ctx.db.get(headJudge.school_id) : null,
              } : null,
              pairing_conflicts: conflicts,
            };
          })
        );

        // Apply post-enrichment search filtering
        let filteredDebates = enrichedDebates;
        if (args.search) {
          const searchLower = args.search.toLowerCase();
          filteredDebates = enrichedDebates.filter(debate => {
            const roomName = debate.room_name?.toLowerCase() || '';
            const propTeamName = debate.proposition_team?.name?.toLowerCase() || '';
            const oppTeamName = debate.opposition_team?.name?.toLowerCase() || '';
            const judgeNames = debate.judge_details?.map(j => j.name?.toLowerCase()).join(' ') || '';

            return roomName.includes(searchLower) ||
              propTeamName.includes(searchLower) ||
              oppTeamName.includes(searchLower) ||
              judgeNames.includes(searchLower);
          });
        }

        // Sort debates by room name
        filteredDebates.sort((a, b) => {
          const roomA = a.room_name || '';
          const roomB = b.room_name || '';

          const numA = parseInt(roomA.match(/\d+/)?.[0] || '999');
          const numB = parseInt(roomB.match(/\d+/)?.[0] || '999');

          if (numA !== numB) return numA - numB;
          return roomA.localeCompare(roomB);
        });

        return {
          ...round,
          motion: visibleMotion(round, sessionResult.user?.role ?? "student"),
          debates: filteredDebates,
          pagination: {
            isDone: paginatedDebates.isDone,
            continueCursor: paginatedDebates.continueCursor
          }
        };
      })
    );

    const sortedRounds = enrichedRounds.sort((a, b) => a.round_number - b.round_number);

    return {
      page: sortedRounds,
      isDone: sortedRounds.length > 0 ? sortedRounds[0].pagination?.isDone ?? true : true,
      continueCursor: sortedRounds.length > 0 ? sortedRounds[0].pagination?.continueCursor : null
    };
  },
});

export const savePairings = mutation({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.number(),
    pairings: v.array(v.object({
      room_name: v.string(),
      proposition_team_id: v.optional(v.id("teams")),
      opposition_team_id: v.optional(v.id("teams")),
      judges: v.array(v.id("users")),
      head_judge_id: v.optional(v.id("users")),
      is_bye_round: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const existingRound = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id_round_number", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number)
      )
      .first();

    let roundId: Id<"rounds">;

    if (existingRound) {
      const existingDebates = await ctx.db
        .query("debates")
        .withIndex("by_round_id", (q) => q.eq("round_id", existingRound._id))
        .collect();

      if (existingDebates.length > 0) {
        const activeDebates = existingDebates.filter(d =>
          d.status === "inProgress" || d.status === "completed"
        );

        if (activeDebates.length > 0) {
          throw new Error(`Cannot overwrite pairings: ${activeDebates.length} debates are in progress or completed`);
        }

        if (tournament.status === "inProgress") {
          if (existingRound.status === "inProgress") {
            throw new Error("Cannot overwrite pairings: Round is currently in progress");
          }
        }

        for (const debate of existingDebates) {
          await ctx.db.delete(debate._id);
        }
      }

      roundId = existingRound._id;
    } else {
      roundId = await ctx.db.insert("rounds", {
        tournament_id: args.tournament_id,
        round_number: args.round_number,
        type: args.round_number <= tournament.prelim_rounds ? "preliminary" : "elimination",
        status: "pending",
        start_time: Date.now() + (24 * 60 * 60 * 1000),
        end_time: Date.now() + (25 * 60 * 60 * 1000),
        motion: "",
        is_impromptu: false,
      });
    }

    const validationErrors: string[] = [];

    const allTeamIds = new Set<Id<"teams">>();
    args.pairings.forEach((pairing, index) => {
      if (pairing.proposition_team_id) {
        if (allTeamIds.has(pairing.proposition_team_id)) {
          validationErrors.push(`Team appears multiple times in pairings (Room ${index + 1})`);
        }
        allTeamIds.add(pairing.proposition_team_id);
      }
      if (pairing.opposition_team_id) {
        if (allTeamIds.has(pairing.opposition_team_id)) {
          validationErrors.push(`Team appears multiple times in pairings (Room ${index + 1})`);
        }
        allTeamIds.add(pairing.opposition_team_id);
      }
    });

    args.pairings.forEach((pairing, index) => {
      if (pairing.proposition_team_id && pairing.opposition_team_id &&
        pairing.proposition_team_id === pairing.opposition_team_id) {
        validationErrors.push(`Team cannot debate itself (Room ${index + 1})`);
      }
    });

    args.pairings.forEach((pairing, index) => {
      if (!pairing.is_bye_round && pairing.judges.length === 0) {
        validationErrors.push(`No judges assigned (Room ${index + 1})`);
      }

      if (pairing.head_judge_id && !pairing.judges.includes(pairing.head_judge_id)) {
        validationErrors.push(`Head judge not in judge list (Room ${index + 1})`);
      }

      if (pairing.judges.length > 1 && pairing.judges.length % 2 === 0 &&
        pairing.judges.length !== tournament.judges_per_debate) {
        validationErrors.push(`Even number of judges detected (Room ${index + 1})`);
      }
    });

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    const debateIds: Id<"debates">[] = [];

    for (const pairing of args.pairings) {
      const debateId = await ctx.db.insert("debates", {
        round_id: roundId,
        tournament_id: args.tournament_id,
        room_name: pairing.room_name,
        proposition_team_id: pairing.proposition_team_id,
        opposition_team_id: pairing.opposition_team_id,
        judges: pairing.judges,
        head_judge_id: pairing.head_judge_id,
        status: "pending",
        is_public_speaking: pairing.is_bye_round,
        poi_count: 0,
        created_at: Date.now(),
      });

      debateIds.push(debateId);
    }

    try {
      await ctx.runMutation(internal.functions.notifications.sendTournamentNotification, {
        token: args.token,
        tournament_id: args.tournament_id,
        title: `Round ${args.round_number} Pairings Released`,
        message: `Pairings for Round ${args.round_number} have been published. Check your debate schedule and room assignments!`,
        type: "tournament",
        send_push: true,
      });
    } catch (error) {
      console.warn("Failed to send notifications:", error);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_updated",
      resource_type: "tournaments",
      resource_id: args.tournament_id,
      description: `Created pairings for Round ${args.round_number} (${args.pairings.length} pairings)`,
    });

    return {
      success: true,
      round_id: roundId,
      debate_ids: debateIds,
      notifications_sent: true,
    };
  },
});

export const updatePairing = mutation({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
    updates: v.object({
      room_name: v.optional(v.string()),
      judges: v.optional(v.array(v.id("users"))),
      head_judge_id: v.optional(v.id("users")),
      proposition_team_id: v.optional(v.id("teams")),
      opposition_team_id: v.optional(v.id("teams")),
    }),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const debate = await ctx.db.get(args.debate_id);
    if (!debate) {
      throw new Error("Debate not found");
    }

    // Allow editing even for saved pairings if debate hasn't started
    if (debate.status === "inProgress" || debate.status === "completed") {
      throw new Error("Cannot update pairings for debates that have started or are completed");
    }

    if (args.updates.judges && args.updates.head_judge_id) {
      if (!args.updates.judges.includes(args.updates.head_judge_id)) {
        throw new Error("Head judge must be in the judges list");
      }
    }

    if (args.updates.proposition_team_id && args.updates.opposition_team_id) {
      if (args.updates.proposition_team_id === args.updates.opposition_team_id) {
        throw new Error("Team cannot debate against itself");
      }
    }

    const previousState = {
      room_name: debate.room_name,
      judges: debate.judges,
      head_judge_id: debate.head_judge_id,
      proposition_team_id: debate.proposition_team_id,
      opposition_team_id: debate.opposition_team_id,
    };

    await ctx.db.patch(args.debate_id, {
      ...args.updates,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "debate_updated",
      resource_type: "debates",
      resource_id: args.debate_id,
      description: `Updated pairing details`,
      previous_state: JSON.stringify(previousState),
      new_state: JSON.stringify(args.updates),
    });

    return { success: true };
  },
});

export const handleTeamWithdrawal = mutation({
  args: {
    token: v.string(),
    team_id: v.id("teams"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const team = await ctx.db.get(args.team_id);
    if (!team) {
      throw new Error("Team not found");
    }

    if (team.status === "withdrawn") {
      throw new Error("Team is already withdrawn");
    }

    await ctx.db.patch(args.team_id, {
      status: "withdrawn",
      updated_at: Date.now(),
    });

    const pendingDebates = await ctx.db
      .query("debates")
      .withIndex("by_tournament_id_status", (q) =>
        q.eq("tournament_id", team.tournament_id).eq("status", "pending")
      )
      .filter(q =>
        q.or(
          q.eq(q.field("proposition_team_id"), args.team_id),
          q.eq(q.field("opposition_team_id"), args.team_id)
        )
      )
      .collect();

    const affectedDebates = [];
    for (const debate of pendingDebates) {
      const remainingTeamId = debate.proposition_team_id === args.team_id ?
        debate.opposition_team_id : debate.proposition_team_id;

      if (!remainingTeamId) continue;

      const remainingTeam = await ctx.db.get(remainingTeamId);

      const round = await ctx.db.get(debate.round_id);
      if (!round) continue;

      await ctx.db.patch(debate._id, {
        is_public_speaking: true,
        proposition_team_id: remainingTeamId,
        opposition_team_id: undefined,
        updated_at: Date.now(),
      });

      affectedDebates.push({
        debate_id: debate._id,
        round_number: round.round_number,
        remaining_team: remainingTeam?.name,
        room_name: debate.room_name,
      });
    }

    try {
      await ctx.runMutation(internal.functions.notifications.sendTournamentNotification, {
        token: args.token,
        tournament_id: team.tournament_id,
        title: "Team Withdrawal",
        message: `Team "${team.name}" has withdrawn from the tournament. Affected pairings have been updated.`,
        type: "tournament",
        send_push: true,
      });
    } catch (error) {
      console.warn("Failed to send withdrawal notification:", error);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "team_updated",
      resource_type: "teams",
      resource_id: args.team_id,
      description: `Team withdrawn: ${team.name}${args.reason ? ` - Reason: ${args.reason}` : ''} (${affectedDebates.length} debates affected)`,
    });

    return {
      success: true,
      affected_debates: affectedDebates,
      withdrawal_reason: args.reason,
    };
  },
});

export const getPairingStats = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const debates = await ctx.db
      .query("debates")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id_status", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("status", "active")
      )
      .collect();

    const qualityMetrics = {
      repeat_matchups: 0,
      side_imbalances: 0,
      multiple_byes: 0,
      school_conflicts: 0,
      judge_overloads: 0,
      total_quality_score: 0,
    };

    return {
      total_rounds: rounds.length,
      total_teams: teams.length,
      total_debates: debates.length,
      public_speaking_rounds: debates.filter(d => d.is_public_speaking).length,
      quality_metrics: qualityMetrics,
      recommendations: generatePairingRecommendations(qualityMetrics, teams.length, rounds.length),
    };
  },
});

export const checkPreliminariesComplete = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const prelimRounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .filter(q => q.eq(q.field("type"), "preliminary"))
      .collect();

    const incompleteRounds = prelimRounds.filter(r => r.status !== "completed");

    return {
      total_prelims: tournament.prelim_rounds,
      completed_prelims: prelimRounds.length - incompleteRounds.length,
      all_complete: incompleteRounds.length === 0,
      incomplete_rounds: incompleteRounds.map(r => ({
        round_number: r.round_number,
        status: r.status
      }))
    };
  },
});

function generatePairingRecommendations(
  qualityMetrics: any,
  totalTeams: number,
  totalRounds: number
): string[] {
  const recommendations: string[] = [];

  if (qualityMetrics.repeat_matchups > 0) {
    recommendations.push(`${qualityMetrics.repeat_matchups} repeat matchups detected. Consider using Swiss system for future rounds.`);
  }

  if (qualityMetrics.side_imbalances > totalTeams * 0.3) {
    recommendations.push("High side imbalance detected. Review side assignment algorithm.");
  }

  if (qualityMetrics.multiple_byes > 0) {
    recommendations.push(`${qualityMetrics.multiple_byes} teams have multiple bye rounds. Ensure fair distribution.`);
  }

  if (qualityMetrics.school_conflicts > 0) {
    recommendations.push(`${qualityMetrics.school_conflicts} same-school matchups found. Review pairing constraints.`);
  }

  if (qualityMetrics.judge_overloads > 0) {
    recommendations.push("Some judges are overloaded. Consider recruiting more volunteers.");
  }

  if (totalRounds > 5 && qualityMetrics.repeat_matchups === 0) {
    recommendations.push("Excellent pairing quality maintained beyond round 5!");
  }

  if (qualityMetrics.total_quality_score === 0) {
    recommendations.push("Perfect pairing quality achieved!");
  } else if (qualityMetrics.total_quality_score < 20) {
    recommendations.push("Good pairing quality with minor issues.");
  } else if (qualityMetrics.total_quality_score < 50) {
    recommendations.push("Moderate pairing quality. Consider algorithm adjustments.");
  } else {
    recommendations.push("Poor pairing quality. Manual intervention recommended.");
  }

  return recommendations;
}