import { query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { countableForRole, isCountableBallot } from "../../lib/ranking_release";
import { Id, Doc } from "../../_generated/dataModel";

export const getStudentDashboardStats = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    totalTournaments: number;
    tournamentsGrowth: number;
    tournamentsAttendedThisYear: number;
    attendedGrowth: number;
    upcomingTournaments: number;
    upcomingGrowth: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const student = sessionResult.user;
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const allTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const totalTournaments = allTournaments.length;

    const studentTeams = await ctx.db
      .query("teams")
      .collect();

    const userTeams = studentTeams.filter(team => team.members.includes(student.id));
    const participatedTournamentIds = Array.from(new Set(userTeams.map(t => t.tournament_id)));

    const participatedTournaments = await Promise.all(
      participatedTournamentIds.map(id => ctx.db.get(id))
    );
    const validParticipatedTournaments = participatedTournaments.filter(Boolean) as Doc<"tournaments">[];

    const tournamentsAttendedThisYear = validParticipatedTournaments.filter(t =>
      t.start_date >= oneYearAgo && t.start_date <= now
    ).length;

    const allUpcomingTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const upcomingTournaments = allUpcomingTournaments.filter(t =>
      t.start_date > now && t.start_date <= now + (30 * 24 * 60 * 60 * 1000)
    ).length;

    const previousYearEnd = oneYearAgo;
    const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60 * 1000);

    const previousYearAttended = validParticipatedTournaments.filter(t =>
      t.start_date >= twoYearsAgo && t.start_date < previousYearEnd
    ).length;

    const attendedGrowth = previousYearAttended > 0
      ? ((tournamentsAttendedThisYear - previousYearAttended) / previousYearAttended) * 100
      : tournamentsAttendedThisYear > 0 ? 100 : 0;

    const previousUpcoming = allUpcomingTournaments.filter(t =>
      t.start_date > thirtyDaysAgo && t.start_date <= now
    ).length;

    const upcomingGrowth = previousUpcoming > 0
      ? ((upcomingTournaments - previousUpcoming) / previousUpcoming) * 100
      : upcomingTournaments > 0 ? 100 : 0;

    const previousTotalTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .filter((q) => q.lte(q.field("created_at"), thirtyDaysAgo))
      .collect();

    const newTournaments = allTournaments.length - previousTotalTournaments.length;
    const tournamentsGrowth = previousTotalTournaments.length > 0
      ? (newTournaments / previousTotalTournaments.length) * 100
      : newTournaments > 0 ? 100 : 0;

    return {
      totalTournaments,
      tournamentsGrowth,
      tournamentsAttendedThisYear,
      attendedGrowth,
      upcomingTournaments,
      upcomingGrowth,
    };
  },
});

export const getStudentRankAndPosition = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    currentRank: number | null;
    totalStudents: number;
    rankChange: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const student = sessionResult.user;

    const allStudents = await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "student").eq("status", "active"))
      .collect();

    const allJudgingScores = await ctx.db.query("judging_scores").collect();
    const allTeams = await ctx.db.query("teams").collect();
    const allDebates = await ctx.db.query("debates").collect();
    const allTournaments = (await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect()).filter((tournament) =>
        countableForRole(tournament, "students", sessionResult.user!.role)
      );

    const sortedTournaments = allTournaments.sort((a, b) => a.end_date - b.end_date);
    const latestTournament = sortedTournaments[sortedTournaments.length - 1];

    if (!latestTournament) {
      return {
        currentRank: null,
        totalStudents: 0,
        rankChange: 0,
      };
    }

    const currentRankings = await calculateStudentRankings(
      ctx, allStudents, allJudgingScores, allTeams, allDebates, sortedTournaments
    );

    const previousTournaments = sortedTournaments.slice(0, -1);
    const previousRankings = await calculateStudentRankings(
      ctx, allStudents, allJudgingScores, allTeams, allDebates, previousTournaments
    );

    const currentStudentRank = currentRankings.find(r => r.student_id === student.id);
    const previousStudentRank = previousRankings.find(r => r.student_id === student.id);

    const currentRank = currentStudentRank?.rank || null;
    const totalStudents = currentRankings.length;

    let rankChange = 0;
    if (currentStudentRank && previousStudentRank) {

      rankChange = previousStudentRank.rank - currentStudentRank.rank;
    } else if (currentStudentRank && !previousStudentRank) {

      rankChange = 0;
    }

    return {
      currentRank,
      totalStudents,
      rankChange,
    };
  },
});

const calculateStudentRankings = async (
  ctx: any,
  allStudents: any[],
  allJudgingScores: any[],
  allTeams: any[],
  allDebates: any[],
  tournaments: any[]
) => {
  const studentsWithPerformance = [];
  const tournamentIds = new Set(tournaments.map(t => t._id));

  for (const studentUser of allStudents) {
    const studentTeams = allTeams.filter(t =>
      t.members.includes(studentUser._id) && tournamentIds.has(t.tournament_id)
    );

    if (studentTeams.length === 0) continue;

    let totalSpeakerPoints = 0;
    let scoresCount = 0;
    let totalTeamWins = 0;
    let totalTeamDebates = 0;
    let highestIndividualScore = 0;
    const individualScores = [];

    const relevantJudgingScores = allJudgingScores.filter(score => {
      const debate = allDebates.find(d => d._id === score.debate_id);
      return debate && tournamentIds.has(debate.tournament_id);
    });

    for (const score of relevantJudgingScores) {
      const studentSpeakerScores = score.speaker_scores.filter((ss: { speaker_id: any; }) => ss.speaker_id === studentUser._id);

      for (const speakerScore of studentSpeakerScores) {
        totalSpeakerPoints += speakerScore.total;
        scoresCount++;
        highestIndividualScore = Math.max(highestIndividualScore, speakerScore.total);
        individualScores.push(speakerScore.total);
      }
    }

    for (const team of studentTeams) {
      const teamDebates = allDebates.filter(d =>
        (d.proposition_team_id === team._id || d.opposition_team_id === team._id) &&
        d.status === "completed" &&
        tournamentIds.has(d.tournament_id)
      );

      for (const debate of teamDebates) {
        totalTeamDebates++;
        if (debate.winning_team_id === team._id) {
          totalTeamWins++;
        }
      }
    }

    if (scoresCount > 0) {

      const avgScore = totalSpeakerPoints / scoresCount;
      const variance = individualScores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / individualScores.length;
      const deviation = Math.sqrt(variance);

      studentsWithPerformance.push({
        student_id: studentUser._id,
        totalSpeakerPoints,
        totalTeamWins,
        highestIndividualScore,
        deviation,
      });
    }
  }

  studentsWithPerformance.sort((a, b) => {
    if (a.totalSpeakerPoints !== b.totalSpeakerPoints) {
      return b.totalSpeakerPoints - a.totalSpeakerPoints;
    }
    if (a.totalTeamWins !== b.totalTeamWins) {
      return b.totalTeamWins - a.totalTeamWins;
    }
    if (a.highestIndividualScore !== b.highestIndividualScore) {
      return b.highestIndividualScore - a.highestIndividualScore;
    }
    return a.deviation - b.deviation;
  });

  return studentsWithPerformance.map((student, index) => ({
    ...student,
    rank: index + 1,
  }));
};

export const getStudentPerformanceTrend = query({
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
    student_performance: number;
    platform_average: number;
    tournament_name?: string;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const student = sessionResult.user;
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

    const allJudgingScores = await ctx.db.query("judging_scores").collect();
    const allTeams = await ctx.db.query("teams").collect();
    const allDebates = await ctx.db.query("debates").collect();

    const performanceData: Array<{
      date: string;
      student_performance: number;
      platform_average: number;
      tournament_name?: string;
    }> = [];

    for (const tournament of relevantTournaments.sort((a, b) => a.start_date - b.start_date)) {

      const studentTeamsInTournament = allTeams.filter(t =>
        t.tournament_id === tournament._id && t.members.includes(student.id)
      );

      if (studentTeamsInTournament.length === 0) continue;

      const tournamentDebates = allDebates.filter(d => d.tournament_id === tournament._id);

      const tournamentScores = allJudgingScores.filter(score =>
        tournamentDebates.some(debate => debate._id === score.debate_id)
      );

      let studentTotalPoints = 0;
      let studentScoreCount = 0;

      for (const score of tournamentScores) {
        const studentSpeakerScores = score.speaker_scores.filter(ss => ss.speaker_id === student.id);
        for (const speakerScore of studentSpeakerScores) {
          studentTotalPoints += speakerScore.total;
          studentScoreCount++;
        }
      }

      if (studentScoreCount === 0) continue;

      const studentAvgPerformance = studentTotalPoints / studentScoreCount;

      let allPointsInTournament = 0;
      let allScoreCountInTournament = 0;

      for (const score of tournamentScores) {
        for (const speakerScore of score.speaker_scores) {
          allPointsInTournament += speakerScore.total;
          allScoreCountInTournament++;
        }
      }

      const platformAverage = allScoreCountInTournament > 0
        ? allPointsInTournament / allScoreCountInTournament
        : 0;

      performanceData.push({
        date: formatDateByPeriod(tournament.start_date, args.period),
        student_performance: Math.round(studentAvgPerformance * 10) / 10,
        platform_average: Math.round(platformAverage * 10) / 10,
        tournament_name: tournament.name,
      });
    }

    return performanceData;
  },
});

export const getStudentLeaderboard = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{
    student_id: Id<"users">;
    student_name: string;
    profile_image?: Id<"_storage">;
    totalPoints: number;
    avgPoints: number;
    tournamentsCount: number;
    rankChange: number;
    rank: number;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const allStudents = await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "student").eq("status", "active"))
      .collect();

    const role = sessionResult.user.role;

    const allTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const countableTournamentIds = new Set(
      allTournaments
        .filter((tournament) => countableForRole(tournament, "students", role))
        .map((tournament) => tournament._id)
    );

    const allTeams = await ctx.db.query("teams").collect();

    const countableTeamIds = new Set(
      allTeams
        .filter((team) => countableTournamentIds.has(team.tournament_id))
        .map((team) => team._id)
    );

    const allDebates = await ctx.db.query("debates").collect();
    const countableDebateIds = new Set(
      allDebates
        .filter((debate) => countableTournamentIds.has(debate.tournament_id))
        .map((debate) => debate._id)
    );

    const allJudgingScores = (await ctx.db.query("judging_scores").collect()).filter(
      (score) => isCountableBallot(score) && countableDebateIds.has(score.debate_id)
    );

    const studentsWithPerformance = [];

    for (const student of allStudents) {
      const studentTeams = allTeams.filter(
        (t) => t.members.includes(student._id) && countableTeamIds.has(t._id)
      );

      if (studentTeams.length === 0) continue;

      let totalPoints = 0;
      let scoresCount = 0;

      for (const score of allJudgingScores) {
        const studentSpeakerScores = score.speaker_scores.filter(ss => ss.speaker_id === student._id);

        for (const speakerScore of studentSpeakerScores) {
          totalPoints += speakerScore.total;
          scoresCount++;
        }
      }

      if (scoresCount > 0) {
        const avgPoints = totalPoints / scoresCount;

        studentsWithPerformance.push({
          student_id: student._id,
          student_name: student.name,
          profile_image: student.profile_image,
          totalPoints: Math.round(totalPoints),
          avgPoints: Math.round(avgPoints * 10) / 10,
          tournamentsCount: new Set(studentTeams.map((t) => t.tournament_id)).size,
          rankChange: 0,
        });
      }
    }

    studentsWithPerformance.sort((a, b) => b.totalPoints - a.totalPoints);

    return studentsWithPerformance.slice(0, 3).map((student, index) => ({
      ...student,
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