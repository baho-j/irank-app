import { query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { Id, Doc } from "../../_generated/dataModel";

export const getVolunteerDashboardStats = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    totalRoundsJudged: number;
    roundsGrowth: number;
    tournamentsAttended: number;
    attendedGrowth: number;
    upcomingTournaments: number;
    upcomingGrowth: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const volunteer = sessionResult.user;
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const allDebates = await ctx.db
      .query("debates")
      .collect();

    const judgedDebates = allDebates.filter(debate =>
      debate.judges.includes(volunteer.id) || debate.head_judge_id === volunteer.id
    );

    const totalRoundsJudged = judgedDebates.length;

    const tournamentIds = Array.from(new Set(judgedDebates.map(d => d.tournament_id)));
    const participatedTournaments = await Promise.all(
      tournamentIds.map(id => ctx.db.get(id))
    );
    const validParticipatedTournaments = participatedTournaments.filter(Boolean) as Doc<"tournaments">[];

    const tournamentsAttended = validParticipatedTournaments.filter(t =>
      t.start_date >= oneYearAgo && t.start_date <= now
    ).length;

    const allUpcomingTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const upcomingCount = allUpcomingTournaments.filter(t =>
      t.start_date > now && t.start_date <= now + (30 * 24 * 60 * 60 * 1000)
    ).length;

    const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);

    const recentRounds = judgedDebates.filter(d => d.start_time && d.start_time > thirtyDaysAgo).length;
    const previousRounds = judgedDebates.filter(d =>
      d.start_time && d.start_time > sixtyDaysAgo && d.start_time <= thirtyDaysAgo
    ).length;

    const roundsGrowth = previousRounds > 0
      ? ((recentRounds - previousRounds) / previousRounds) * 100
      : recentRounds > 0 ? 100 : 0;

    const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60 * 1000);
    const previousYearTournaments = validParticipatedTournaments.filter(t =>
      t.start_date >= twoYearsAgo && t.start_date < oneYearAgo
    ).length;

    const attendedGrowth = previousYearTournaments > 0
      ? ((tournamentsAttended - previousYearTournaments) / previousYearTournaments) * 100
      : tournamentsAttended > 0 ? 100 : 0;

    const previousUpcoming = allUpcomingTournaments.filter(t =>
      t.start_date > thirtyDaysAgo && t.start_date <= now
    ).length;

    const upcomingGrowth = previousUpcoming > 0
      ? ((upcomingCount - previousUpcoming) / previousUpcoming) * 100
      : upcomingCount > 0 ? 100 : 0;

    return {
      totalRoundsJudged,
      roundsGrowth,
      tournamentsAttended,
      attendedGrowth,
      upcomingTournaments: upcomingCount,
      upcomingGrowth,
    };
  },
});

export const getVolunteerRankAndPosition = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    currentRank: number | null;
    totalVolunteers: number;
    rankChange: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const volunteer = sessionResult.user;

    const allVolunteers = await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "volunteer").eq("status", "active"))
      .collect();

    const allDebates = await ctx.db.query("debates").collect();
    const allJudgeFeedback = await ctx.db.query("judge_feedback").collect();
    const allTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const sortedTournaments = allTournaments.sort((a, b) => a.end_date - b.end_date);
    const latestTournament = sortedTournaments[sortedTournaments.length - 1];

    if (!latestTournament) {
      return {
        currentRank: null,
        totalVolunteers: 0,
        rankChange: 0,
      };
    }

    const currentRankings = await calculateVolunteerRankings(
      ctx, allVolunteers, allDebates, allJudgeFeedback, sortedTournaments
    );

    const previousTournaments = sortedTournaments.slice(0, -1);
    const previousRankings = await calculateVolunteerRankings(
      ctx, allVolunteers, allDebates, allJudgeFeedback, previousTournaments
    );

    const currentVolunteerRank = currentRankings.find(r => r.volunteer_id === volunteer.id);
    const previousVolunteerRank = previousRankings.find(r => r.volunteer_id === volunteer.id);

    const currentRank = currentVolunteerRank?.rank || null;
    const totalVolunteers = currentRankings.length;

    let rankChange = 0;
    if (currentVolunteerRank && previousVolunteerRank) {

      rankChange = previousVolunteerRank.rank - currentVolunteerRank.rank;
    } else if (currentVolunteerRank && !previousVolunteerRank) {

      rankChange = 0;
    }

    return {
      currentRank,
      totalVolunteers,
      rankChange,
    };
  },
});

const calculateVolunteerRankings = async (
  ctx: any,
  allVolunteers: any[],
  allDebates: any[],
  allJudgeFeedback: any[],
  tournaments: any[]
) => {
  const volunteersWithPerformance = [];
  const tournamentIds = new Set(tournaments.map(t => t._id));

  const allRounds = await ctx.db.query("rounds").collect();

  for (const volunteerUser of allVolunteers) {

    const judgedDebates = allDebates.filter(d =>
      (d.judges.includes(volunteerUser._id) || d.head_judge_id === volunteerUser._id) &&
      tournamentIds.has(d.tournament_id)
    );

    if (judgedDebates.length === 0) continue;

    let elimDebatesJudged = 0;
    let prelimDebatesJudged = 0;

    for (const debate of judgedDebates) {
      const round = allRounds.find((r: { _id: any; }) => r._id === debate.round_id);
      if (round) {
        if (round.type === "elimination") {
          elimDebatesJudged++;
        } else if (round.type === "preliminary") {
          prelimDebatesJudged++;
        }
      }
    }

    const weightedDebateScore = (elimDebatesJudged * 2) + prelimDebatesJudged;

    const volunteerFeedback = allJudgeFeedback.filter(f =>
      f.judge_id === volunteerUser._id && tournamentIds.has(f.tournament_id)
    );

    let avgFeedbackScore = 0;
    if (volunteerFeedback.length > 0) {
      const totalFeedbackScore = volunteerFeedback.reduce((sum, feedback) => {
        return sum + ((feedback.clarity + feedback.fairness + feedback.knowledge + feedback.helpfulness) / 4);
      }, 0);
      avgFeedbackScore = totalFeedbackScore / volunteerFeedback.length;
    }

    const participatedTournaments = Array.from(new Set(judgedDebates.map(d => d.tournament_id))).length;
    const attendanceScore = participatedTournaments > 0 ? (judgedDebates.length / participatedTournaments) : 0;

    volunteersWithPerformance.push({
      volunteer_id: volunteerUser._id,
      weightedDebateScore,
      attendanceScore,
      avgFeedbackScore,
      totalDebatesJudged: judgedDebates.length,
    });
  }

  volunteersWithPerformance.sort((a, b) => {
    if (a.weightedDebateScore !== b.weightedDebateScore) {
      return b.weightedDebateScore - a.weightedDebateScore;
    }
    if (a.attendanceScore !== b.attendanceScore) {
      return b.attendanceScore - a.attendanceScore;
    }
    return b.avgFeedbackScore - a.avgFeedbackScore;
  });

  return volunteersWithPerformance.map((volunteer, index) => ({
    ...volunteer,
    rank: index + 1,
  }));
};

export const getVolunteerPerformanceTrend = query({
  args: {
    token: v.string(),
    period: v.union(
      v.literal("three_months"),
      v.literal("six_months"),
      v.literal("one_year")
    ),
  },
  handler: async (ctx, args): Promise<Array<{
    date: string;
    volunteer_performance: number;
    platform_average: number;
    tournament_name?: string;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const volunteer = sessionResult.user;
    const now = Date.now();
    let startDate: number;

    switch (args.period) {
      case "three_months":
        startDate = now - (90 * 24 * 60 * 60 * 1000);
        break;
      case "six_months":
        startDate = now - (180 * 24 * 60 * 60 * 1000);
        break;
      case "one_year":
        startDate = now - (365 * 24 * 60 * 60 * 1000);
        break;
    }

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const relevantTournaments = tournaments.filter(t =>
      t.start_date >= startDate && t.start_date <= now
    );

    const allDebates = await ctx.db.query("debates").collect();
    const allJudgeResults = await ctx.db.query("judge_results").collect();

    const performanceData: Array<{
      date: string;
      volunteer_performance: number;
      platform_average: number;
      tournament_name?: string;
    }> = [];

    for (const tournament of relevantTournaments.sort((a, b) => a.start_date - b.start_date)) {

      const tournamentDebates = allDebates.filter(d =>
        d.tournament_id === tournament._id && d.judges.includes(volunteer.id)
      );

      if (tournamentDebates.length === 0) continue;

      const volunteerJudgeResult = allJudgeResults.find(jr =>
        jr.tournament_id === tournament._id && jr.judge_id === volunteer.id
      );

      let volunteerScore = 3.0;
      if (volunteerJudgeResult) {
        volunteerScore = volunteerJudgeResult.avg_feedback_score;
      }

      const tournamentJudgeResults = allJudgeResults.filter(jr => jr.tournament_id === tournament._id);
      let platformAverage = 3.0;
      if (tournamentJudgeResults.length > 0) {
        const totalScore = tournamentJudgeResults.reduce((sum, jr) => sum + jr.avg_feedback_score, 0);
        platformAverage = totalScore / tournamentJudgeResults.length;
      }

      performanceData.push({
        date: formatDateByPeriod(tournament.start_date, args.period),
        volunteer_performance: Math.round(volunteerScore * 10) / 10,
        platform_average: Math.round(platformAverage * 10) / 10,
        tournament_name: tournament.name,
      });
    }

    return performanceData;
  },
});

export const getVolunteerLeaderboard = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{
    volunteer_id: Id<"users">;
    volunteer_name: string;
    profile_image?: Id<"_storage">;
    totalDebates: number;
    avgFeedbackScore: number;
    headJudgeCount: number;
    rankChange: number;
    rank: number;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const allVolunteers = await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "volunteer").eq("status", "active"))
      .collect();

    const allDebates = await ctx.db.query("debates").collect();
    const allJudgeResults = await ctx.db.query("judge_results").collect();

    const volunteersWithPerformance = [];

    for (const volunteer of allVolunteers) {
      const judgedDebates = allDebates.filter(d => d.judges.includes(volunteer._id));
      const judgeResult = allJudgeResults.find(jr => jr.judge_id === volunteer._id);

      if (judgedDebates.length > 0 || judgeResult) {
        const totalDebates = judgeResult?.total_debates_judged || judgedDebates.length;
        const headJudgeCount = judgeResult?.head_judge_assignments ||
          judgedDebates.filter(d => d.head_judge_id === volunteer._id).length;
        const avgFeedbackScore = judgeResult?.avg_feedback_score || 3.0;

        volunteersWithPerformance.push({
          volunteer_id: volunteer._id,
          volunteer_name: volunteer.name,
          profile_image: volunteer.profile_image,
          totalDebates,
          avgFeedbackScore: Math.round(avgFeedbackScore * 10) / 10,
          headJudgeCount,
          rankChange: 0,
        });
      }
    }

    volunteersWithPerformance.sort((a, b) => {
      if (a.totalDebates !== b.totalDebates) return b.totalDebates - a.totalDebates;
      if (a.avgFeedbackScore !== b.avgFeedbackScore) return b.avgFeedbackScore - a.avgFeedbackScore;
      return b.headJudgeCount - a.headJudgeCount;
    });

    return volunteersWithPerformance.slice(0, 3).map((volunteer, index) => ({
      ...volunteer,
      rank: index + 1,
    }));
  },
});

function formatDateByPeriod(timestamp: number, period: string): string {
  const date = new Date(timestamp);

  switch (period) {
    case "three_months":
      return date.toLocaleDateString('en-US', { month: 'short' });
    case "six_months":
      return date.toLocaleDateString('en-US', { month: 'short' });
    case "one_year":
      return date.toLocaleDateString('en-US', { month: 'short' });
    default:
      return date.toLocaleDateString('en-US', { month: 'short' });
  }
}