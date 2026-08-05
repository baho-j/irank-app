import { mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { Doc, Id } from "../../_generated/dataModel";
import { visibleMotion } from "../../lib/motion_release";
import { paginationOptsValidator } from "convex/server";
import { resolvePanel } from "../../lib/ballot_results";
import { scoreBallot, speakerScoreValidator } from "../../lib/ballot_validation";

export const getJudgeAssignedDebates = query({
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

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const judgeId: Id<"users"> = sessionResult.user.id;

    let debatesQuery;
    if (args.round_number) {
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id_round_number", (q) =>
          q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number as number)
        )
        .first();

      if (round) {
        debatesQuery = ctx.db
          .query("debates")
          .withIndex("by_round_id", (q) => q.eq("round_id", round._id));
      } else {
        return {
          page: [],
          isDone: true,
          continueCursor: null,
        };
      }
    } else {
      debatesQuery = ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id));
    }

    const allDebates = await debatesQuery.collect();

    const judgeDebates = allDebates.filter(debate =>
      debate.judges.includes(judgeId)
    );

    const totalItems = judgeDebates.length;
    const startIndex = args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor) : 0;
    const endIndex = Math.min(startIndex + args.paginationOpts.numItems, totalItems);
    const paginatedDebates = judgeDebates.slice(startIndex, endIndex);
    const isDone = endIndex >= totalItems;

    const enrichedDebates = await Promise.all(
      paginatedDebates.map(async (debate) => {
        const propTeam: Doc<"teams"> | null = debate.proposition_team_id
          ? await ctx.db.get(debate.proposition_team_id)
          : null;
        const oppTeam: Doc<"teams"> | null = debate.opposition_team_id
          ? await ctx.db.get(debate.opposition_team_id)
          : null;

        const round: Doc<"rounds"> | null = await ctx.db.get(debate.round_id);

        const judgeSubmission: Doc<"judging_scores"> | null = await ctx.db
          .query("judging_scores")
          .withIndex("by_debate_id_judge_id", (q) =>
            q.eq("debate_id", debate._id).eq("judge_id", judgeId)
          )
          .first();

        const allSubmissions: Doc<"judging_scores">[] = await ctx.db
          .query("judging_scores")
          .withIndex("by_debate_id", (q) => q.eq("debate_id", debate._id))
          .collect();

        return {
          ...debate,
          round: round ? { ...round, motion: visibleMotion(round, "volunteer") } : null,
          proposition_team: propTeam,
          opposition_team: oppTeam,
          my_submission: judgeSubmission,
          all_submissions_count: allSubmissions.length,
          is_head_judge: debate.head_judge_id === judgeId,
        };
      })
    );

    let filteredPage = enrichedDebates;
    if (args.search && args.search.trim()) {
      const searchLower = args.search.toLowerCase();
      filteredPage = enrichedDebates.filter(debate => {
        const roomName = debate.room_name?.toLowerCase() || '';
        const propTeamName = debate.proposition_team?.name?.toLowerCase() || '';
        const oppTeamName = debate.opposition_team?.name?.toLowerCase() || '';

        const judges = debate.judges || [];
        const judgeNames = judges.map(() => 'judge').join(' ').toLowerCase();

        return roomName.includes(searchLower) ||
          propTeamName.includes(searchLower) ||
          oppTeamName.includes(searchLower) ||
          judgeNames.includes(searchLower);
      });
    }

    const sortedPage = filteredPage.sort((a, b) => {
      if (!a.round || !b.round) return 0;
      return a.round.round_number - b.round.round_number;
    });

    return {
      page: sortedPage,
      isDone,
      continueCursor: isDone ? null : endIndex.toString(),
    };
  },
});

const checkAndUpdateRoundCompletion = async (ctx: any, roundId: Id<"rounds">) => {
  const round = await ctx.db.get(roundId);
  if (!round || round.status === "completed") return;

  const roundDebates = await ctx.db
    .query("debates")
    .withIndex("by_round_id", (q: any) => q.eq("round_id", roundId))
    .collect();

  if (roundDebates.length === 0) return;

  const allDebatesCompleted = roundDebates.every((debate: any) => {
    return debate.status === "completed" && debate.winning_team_id;
  });

  let allBallotsSubmitted = true;
  for (const debate of roundDebates) {
    if (debate.judges && debate.judges.length > 0) {
      const submissions = await ctx.db
        .query("judging_scores")
        .withIndex("by_debate_id_submission_state", (q: any) =>
          q.eq("debate_id", debate._id).eq("submission_state", "submitted")
        )
        .collect();

      if (submissions.length < debate.judges.length) {
        allBallotsSubmitted = false;
        break;
      }
    }
  }

  if (allDebatesCompleted && allBallotsSubmitted) {
    await ctx.db.patch(roundId, {
      status: "completed",
      end_time: Date.now(),
      updated_at: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.functions.notification_emails.sendRoundCompletedEmails,
      { tournament_id: round.tournament_id, round_id: roundId }
    );
  }
};

export const updateDebateResults = async (ctx: any, debateId: Id<"debates">) => {
  const submissions = await ctx.db
    .query("judging_scores")
    .withIndex("by_debate_id_submission_state", (q: any) =>
      q.eq("debate_id", debateId).eq("submission_state", "submitted")
    )
    .collect();

  if (submissions.length === 0) return;

  const debate = await ctx.db.get(debateId);
  if (!debate) return;

  const outcome = resolvePanel(submissions, debate);

  await ctx.db.patch(debateId, {
    winning_team_id: outcome.winning_team_id,
    winning_team_position: outcome.winning_position,
    proposition_votes: outcome.proposition_votes,
    opposition_votes: outcome.opposition_votes,
    proposition_team_points: debate.proposition_team_id
      ? outcome.team_points.get(debate.proposition_team_id) ?? 0
      : undefined,
    opposition_team_points: debate.opposition_team_id
      ? outcome.team_points.get(debate.opposition_team_id) ?? 0
      : undefined,
    status: outcome.decided ? "completed" : debate.status,
    updated_at: Date.now(),
  });

  if (outcome.decided) {
    await checkAndUpdateRoundCompletion(ctx, debate.round_id);
  }
};

export const submitBallot = mutation({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
    winning_team_id: v.id("teams"),
    winning_position: v.union(v.literal("proposition"), v.literal("opposition")),
    speaker_scores: v.array(speakerScoreValidator),
    rfd: v.optional(v.string()),
    notes: v.optional(v.string()),
    is_final_submission: v.boolean(),
    fact_checks: v.optional(v.array(v.object({
      claim: v.string(),
      result: v.union(
        v.literal("true"),
        v.literal("false"),
        v.literal("partially_true"),
        v.literal("inconclusive")
      ),
      sources: v.optional(v.array(v.string())),
      checked_by: v.id("users"),
      timestamp: v.number(),
      explanation: v.optional(v.string())
    }))),
    argument_flow: v.optional(v.array(v.object({
      type: v.union(
        v.literal("main"),
        v.literal("rebuttal"),
        v.literal("poi")
      ),
      content: v.string(),
      speaker: v.id("users"),
      team: v.id("teams"),
      timestamp: v.number(),
      rebutted_by: v.optional(v.array(v.string())),
      strength: v.optional(v.number())
    }))),
  },
  handler: async (ctx, args): Promise<{ success: boolean; ballot_id: Id<"judging_scores"> }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const judgeId: Id<"users"> = sessionResult.user.id;

    const debate: Doc<"debates"> | null = await ctx.db.get(args.debate_id);
    if (!debate) {
      throw new Error("Debate not found");
    }

    if (!debate.judges.includes(judgeId)) {
      throw new Error("Not assigned to this debate");
    }

    const existingSubmission: Doc<"judging_scores"> | null = await ctx.db
      .query("judging_scores")
      .withIndex("by_debate_id_judge_id", (q) =>
        q.eq("debate_id", args.debate_id).eq("judge_id", judgeId)
      )
      .first();

    if (existingSubmission?.submission_state === "submitted") {
      throw new Error(
        "This ballot has been submitted and is locked. Ask a coordinator to make any correction."
      );
    }

    const tournament = await ctx.db.get(debate.tournament_id);

    if (tournament && tournament.format !== "WorldSchools") {
      throw new Error(
        `Ballots are only available for World Schools tournaments. ${tournament.format} support is coming soon.`
      );
    }

    const processedSpeakerScores = scoreBallot({
      speaker_scores: args.speaker_scores,
      winning_team_id: args.winning_team_id,
      rfd: args.rfd,
      is_final_submission: args.is_final_submission,
      team_size: tournament?.team_size,
    });

    const now = Date.now();

    const ballotData = {
      debate_id: args.debate_id,
      tournament_id: debate.tournament_id,
      judge_id: judgeId,
      winning_team_id: args.winning_team_id,
      winning_position: args.winning_position,
      speaker_scores: processedSpeakerScores,
      rfd: args.rfd,
      notes: args.notes,
      submission_state: (args.is_final_submission
        ? "submitted"
        : "in_progress") as "submitted" | "in_progress",
      submitted_at: args.is_final_submission ? now : undefined,
      created_at: now,
    };

    let ballotId: Id<"judging_scores">;

    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        ...ballotData,
        updated_at: Date.now(),
      });
      ballotId = existingSubmission._id;
    } else {
      ballotId = await ctx.db.insert("judging_scores", ballotData);
    }

    if (args.fact_checks || args.argument_flow) {
      const currentDebate = await ctx.db.get(args.debate_id);
      if (currentDebate) {
        const updates: any = {};

        if (args.fact_checks) {
          const existingFactChecks = currentDebate.fact_checks || [];
          const newFactChecks = args.fact_checks.filter(newCheck =>
            !existingFactChecks.some(existing =>
              existing.claim === newCheck.claim && existing.checked_by === newCheck.checked_by
            )
          );
          updates.fact_checks = [...existingFactChecks, ...newFactChecks];
        }

        if (args.argument_flow) {
          const existingFlow = currentDebate.argument_flow || [];
          const newFlow = args.argument_flow.filter(newArg =>
            !existingFlow.some(existing =>
              existing.content === newArg.content &&
              existing.speaker === newArg.speaker &&
              existing.timestamp === newArg.timestamp
            )
          );
          updates.argument_flow = [...existingFlow, ...newFlow];
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = Date.now();
          await ctx.db.patch(args.debate_id, updates);
        }
      }
    }

    if (args.is_final_submission) {
      await updateDebateResults(ctx, args.debate_id);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: judgeId,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: ballotId,
      description: args.is_final_submission
        ? "Submitted final ballot"
        : "Updated ballot draft",
    });

    return { success: true, ballot_id: ballotId };
  },
});

export const getJudgeBallot = query({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
  },
  handler: async (ctx, args): Promise<Doc<"judging_scores"> | null> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const judgeId: Id<"users"> = sessionResult.user.id;

    const debate: Doc<"debates"> | null = await ctx.db.get(args.debate_id);
    if (!debate) {
      throw new Error("Debate not found");
    }

    if (!debate.judges.includes(judgeId)) {
      throw new Error("Not assigned to this debate");
    }

    return await ctx.db
      .query("judging_scores")
      .withIndex("by_debate_id_judge_id", (q) =>
        q.eq("debate_id", args.debate_id).eq("judge_id", judgeId)
      )
      .first();
  },
});

export const getDebateJudgeSubmissions = query({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
  },
  handler: async (ctx, args): Promise<any[]> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const judgeId: Id<"users"> = sessionResult.user.id;

    const debate: Doc<"debates"> | null = await ctx.db.get(args.debate_id);
    if (!debate) {
      throw new Error("Debate not found");
    }

    if (debate.head_judge_id !== judgeId) {
      throw new Error("Only head judge can view all submissions");
    }

    const submissions: Doc<"judging_scores">[] = await ctx.db
      .query("judging_scores")
      .withIndex("by_debate_id", (q) => q.eq("debate_id", args.debate_id))
      .collect();

    return await Promise.all(
      submissions.map(async (submission) => {
        const judge: Doc<"users"> | null = await ctx.db.get(submission.judge_id);
        return {
          ...submission,
          judge_name: judge?.name || "Unknown Judge",
        };
      })
    );
  },
});

export const flagBallot = mutation({
  args: {
    token: v.string(),
    ballot_id: v.id("judging_scores"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const ballot: Doc<"judging_scores"> | null = await ctx.db.get(args.ballot_id);
    if (!ballot) {
      throw new Error("Ballot not found");
    }

    const debate: Doc<"debates"> | null = await ctx.db.get(ballot.debate_id);
    if (!debate || !debate.judges.includes(sessionResult.user.id)) {
      throw new Error("Not authorized to flag this ballot");
    }

    const currentNotes: string = ballot.notes || "";
    const flaggedNotes: string = currentNotes + `\n[JUDGE FLAG: ${args.reason} - Flagged by Judge ${sessionResult.user.id}]`;

    await ctx.db.patch(args.ballot_id, {
      notes: flaggedNotes,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: args.ballot_id,
      description: `Judge flagged ballot for review: ${args.reason}`,
    });

    return { success: true };
  },
});