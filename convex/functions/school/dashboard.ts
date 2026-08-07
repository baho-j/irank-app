import { query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { countableForRole } from "../../lib/ranking_release";
import { Id, Doc } from "../../_generated/dataModel";

export const getSchoolDashboardStats = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    activeDebaters: number;
    debatersGrowth: number;
    tournamentsAttendedLastYear: number;
    tournamentsGrowth: number;
    upcomingTournaments: number;
    upcomingGrowth: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolUser = sessionResult.user;
    if (!schoolUser.school_id) {
      throw new Error("No school associated with this account");
    }

    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const schoolStudents = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", schoolUser.school_id).eq("role", "student")
      )
      .collect();

    const activeDebaters = schoolStudents.filter(s => s.status === "active").length;

    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q) => q.eq("school_id", schoolUser.school_id))
      .collect();

    const tournamentIds = Array.from(new Set(schoolTeams.map(t => t.tournament_id)));
    const participatedTournaments = await Promise.all(
      tournamentIds.map(id => ctx.db.get(id))
    );
    const validParticipatedTournaments = participatedTournaments.filter(Boolean) as Doc<"tournaments">[];

    const tournamentsAttendedLastYear = validParticipatedTournaments.filter(t =>
      t.start_date >= oneYearAgo && t.start_date <= now
    ).length;

    const allUpcomingTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const upcomingTournaments = allUpcomingTournaments.filter(t =>
      t.start_date > now && t.start_date <= now + (30 * 24 * 60 * 60 * 1000)
    ).length;

    const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60 * 1000);
    const previousYearParticipated = validParticipatedTournaments.filter(t =>
      t.start_date >= twoYearsAgo && t.start_date < oneYearAgo
    ).length;

    const tournamentsGrowth = previousYearParticipated > 0
      ? ((tournamentsAttendedLastYear - previousYearParticipated) / previousYearParticipated) * 100
      : tournamentsAttendedLastYear > 0 ? 100 : 0;

    const previousMonthStart = thirtyDaysAgo;
    const previousMonthEnd = now;
    const previousUpcoming = allUpcomingTournaments.filter(t =>
      t.start_date > previousMonthStart && t.start_date <= previousMonthEnd
    ).length;

    const upcomingGrowth = previousUpcoming > 0
      ? ((upcomingTournaments - previousUpcoming) / previousUpcoming) * 100
      : upcomingTournaments > 0 ? 100 : 0;

    const studentCountThirtyDaysAgo = schoolStudents.filter(s =>
      s.created_at <= thirtyDaysAgo && s.status === "active"
    ).length;
    const newActiveDebaters = schoolStudents.filter(s =>
      s.created_at > thirtyDaysAgo && s.status === "active"
    ).length;

    const debatersGrowth = studentCountThirtyDaysAgo > 0
      ? (newActiveDebaters / studentCountThirtyDaysAgo) * 100
      : newActiveDebaters > 0 ? 100 : 0;

    return {
      activeDebaters,
      debatersGrowth,
      tournamentsAttendedLastYear,
      tournamentsGrowth,
      upcomingTournaments,
      upcomingGrowth,
    };
  },
});

export const getSchoolRankAndPosition = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    currentRank: number | null;
    totalSchools: number;
    rankChange: number;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolUser = sessionResult.user;
    if (!schoolUser.school_id) {
      throw new Error("No school associated with this account");
    }

    const allSchools = await ctx.db
      .query("schools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const allDebates = await ctx.db.query("debates").collect();
    const allTournaments = (await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect()).filter((tournament) =>
        countableForRole(tournament, "schools", sessionResult.user!.role)
      );

    const sortedTournaments = allTournaments.sort((a, b) => a.end_date - b.end_date);
    const latestTournament = sortedTournaments[sortedTournaments.length - 1];

    if (!latestTournament) {
      return {
        currentRank: null,
        totalSchools: 0,
        rankChange: 0,
      };
    }

    const currentRankings = await calculateSchoolRankings(ctx, allSchools, allDebates, sortedTournaments);

    const previousTournaments = sortedTournaments.slice(0, -1);
    const previousRankings = await calculateSchoolRankings(ctx, allSchools, allDebates, previousTournaments);

    const currentSchoolRank = currentRankings.find(r => r.school_id === schoolUser.school_id);
    const previousSchoolRank = previousRankings.find(r => r.school_id === schoolUser.school_id);

    const currentRank = currentSchoolRank?.rank || null;
    const totalSchools = currentRankings.length;

    let rankChange = 0;
    if (currentSchoolRank && previousSchoolRank) {

      rankChange = previousSchoolRank.rank - currentSchoolRank.rank;
    } else if (currentSchoolRank && !previousSchoolRank) {

      rankChange = 0;
    }

    return {
      currentRank,
      totalSchools,
      rankChange,
    };
  },
});

const calculateSchoolRankings = async (
  ctx: any,
  allSchools: any[],
  allDebates: any[],
  tournaments: any[]
) => {
  const schoolsWithPerformance = [];

  for (const school of allSchools) {
    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q: any) => q.eq("school_id", school._id))
      .collect();

    if (schoolTeams.length === 0) continue;

    let totalWins = 0;
    let totalDebates = 0;
    let totalPoints = 0;
    let bestTeamRank = 999;
    let participatedTournaments = 0;

    for (const tournament of tournaments) {
      const tournamentTeams = schoolTeams.filter((t: any) => t.tournament_id === tournament._id);
      if (tournamentTeams.length === 0) continue;

      participatedTournaments++;
      const tournamentDebates = allDebates.filter(d =>
        d.tournament_id === tournament._id && d.status === "completed"
      );

      let tournamentWins = 0;
      let tournamentTotalDebates = 0;
      let tournamentPoints = 0;

      for (const debate of tournamentDebates) {
        const schoolTeamInDebate = tournamentTeams.find((team: { _id: any; }) =>
          team._id === debate.proposition_team_id || team._id === debate.opposition_team_id
        );

        if (schoolTeamInDebate) {
          tournamentTotalDebates++;

          if (debate.winning_team_id === schoolTeamInDebate._id) {
            tournamentWins++;
          }

          if (debate.proposition_team_id === schoolTeamInDebate._id && debate.proposition_team_points) {
            tournamentPoints += debate.proposition_team_points;
          } else if (debate.opposition_team_id === schoolTeamInDebate._id && debate.opposition_team_points) {
            tournamentPoints += debate.opposition_team_points;
          }
        }
      }

      totalWins += tournamentWins;
      totalDebates += tournamentTotalDebates;
      totalPoints += tournamentPoints;

      const winRate = tournamentTotalDebates > 0 ? tournamentWins / tournamentTotalDebates : 0;
      const approximateRank = Math.max(1, Math.ceil((1 - winRate) * 50));
      bestTeamRank = Math.min(bestTeamRank, approximateRank);
    }

    if (participatedTournaments > 0) {
      schoolsWithPerformance.push({
        school_id: school._id,
        school_name: school.name,
        totalWins,
        totalPoints,
        bestTeamRank,
        participatedTournaments,
      });
    }
  }

  schoolsWithPerformance.sort((a, b) => {
    if (a.totalWins !== b.totalWins) return b.totalWins - a.totalWins;
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    return a.bestTeamRank - b.bestTeamRank;
  });

  return schoolsWithPerformance.map((school, index) => ({
    ...school,
    rank: index + 1,
  }));
};


export const getSchoolPerformanceTrend = query({
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
    school_performance: number;
    platform_average: number;
    tournament_name?: string;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolUser = sessionResult.user;
    if (!schoolUser.school_id) {
      throw new Error("No school associated with this account");
    }

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

    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q) => q.eq("school_id", schoolUser.school_id))
      .collect();

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const relevantTournaments = tournaments.filter(t =>
      t.start_date >= startDate && t.start_date <= now &&
      schoolTeams.some(team => team.tournament_id === t._id)
    );

    let dataPoints: Array<{
      date: string;
      school_performance: number;
      platform_average: number;
      tournament_name?: string;
    }> = [];

    if (relevantTournaments.length === 0) {
      switch (args.period) {
        case "three_months":
          dataPoints = generateMonthlyEmptyData(startDate, now);
          break;
        case "six_months":
          dataPoints = generateMonthlyEmptyData(startDate, now);
          break;
        case "one_year":
          dataPoints = generateMonthlyEmptyData(startDate, now);
          break;
      }
      return dataPoints;
    }

    const allDebates = await ctx.db.query("debates").collect();

    for (const tournament of relevantTournaments.sort((a, b) => a.start_date - b.start_date)) {
      const tournamentTeams = schoolTeams.filter(t => t.tournament_id === tournament._id);

      if (tournamentTeams.length > 0) {
        const tournamentDebates = allDebates.filter(d => d.tournament_id === tournament._id);

        let tournamentPoints = 0;
        let tournamentTeamsCount = 0;

        for (const team of tournamentTeams) {
          const teamDebates = tournamentDebates.filter(d =>
            d.proposition_team_id === team._id || d.opposition_team_id === team._id
          );

          let teamPoints = 0;
          for (const debate of teamDebates) {
            if (debate.proposition_team_id === team._id) {
              teamPoints += debate.proposition_team_points || 0;
            }
            if (debate.opposition_team_id === team._id) {
              teamPoints += debate.opposition_team_points || 0;
            }
          }

          tournamentPoints += teamPoints;
          tournamentTeamsCount++;
        }

        const avgPoints = tournamentTeamsCount > 0 ? tournamentPoints / tournamentTeamsCount : 0;

        let allTournamentPoints = 0;
        let allTournamentTeamsCount = 0;

        for (const debate of tournamentDebates) {
          if (debate.proposition_team_points) {
            allTournamentPoints += debate.proposition_team_points;
            allTournamentTeamsCount++;
          }
          if (debate.opposition_team_points) {
            allTournamentPoints += debate.opposition_team_points;
            allTournamentTeamsCount++;
          }
        }

        const platformAverage = allTournamentTeamsCount > 0
          ? allTournamentPoints / allTournamentTeamsCount
          : 0;

        dataPoints.push({
          date: formatDateByPeriod(tournament.start_date, args.period),
          school_performance: Math.round(avgPoints * 10) / 10,
          platform_average: Math.round(platformAverage * 10) / 10,
          tournament_name: tournament.name,
        });
      }
    }

    return dataPoints;
  },
});

function formatDateByPeriod(timestamp: number, period: string): string {
  const date = new Date(timestamp);

  switch (period) {
    case "three_months":
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case "six_months":
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case "one_year":
      return date.toLocaleDateString('en-US', { month: 'short' });
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function generateMonthlyEmptyData(startDate: number, endDate: number) {
  const dataPoints = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    dataPoints.push({
      date: d.toLocaleDateString('en-US', { month: 'short' }),
      school_performance: 0,
      platform_average: 0,
    });
  }

  return dataPoints;
}

export const getSchoolLeaderboard = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{
    school_id: Id<"schools">;
    school_name: string;
    logo_url?: Id<"_storage">;
    totalPoints: number;
    totalWins: number;
    tournamentCount: number;
    avgPoints: number;
    rankChange: number;
    rank: number;
  }>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const allSchools = await ctx.db
      .query("schools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const role = sessionResult.user.role;

    const completedTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const countableTournamentIds = new Set(
      completedTournaments
        .filter((tournament) => countableForRole(tournament, "schools", role))
        .map((tournament) => tournament._id)
    );

    const schoolsWithPerformance = [];
    const allDebates = (await ctx.db.query("debates").collect()).filter((debate) =>
      countableTournamentIds.has(debate.tournament_id)
    );

    for (const school of allSchools) {
      const schoolTeams = (await ctx.db
        .query("teams")
        .withIndex("by_school_id", (q) => q.eq("school_id", school._id))
        .collect()).filter((team) => countableTournamentIds.has(team.tournament_id));

      if (schoolTeams.length > 0) {
        let totalPoints = 0;
        let totalWins = 0;
        let tournamentCount = 0;

        const tournamentIds = Array.from(new Set(schoolTeams.map(t => t.tournament_id)));

        for (const tournamentId of tournamentIds) {
          const tournamentTeams = schoolTeams.filter(t => t.tournament_id === tournamentId);
          const tournamentDebates = allDebates.filter(d =>
            d.tournament_id === tournamentId && d.status === "completed"
          );

          let tournamentWins = 0;
          let tournamentPoints = 0;

          for (const debate of tournamentDebates) {
            if (debate.winning_team_id && tournamentTeams.some(t => t._id === debate.winning_team_id)) {
              tournamentWins++;
            }

            if (debate.proposition_team_id && tournamentTeams.some(t => t._id === debate.proposition_team_id)) {
              tournamentPoints += debate.proposition_team_points || 0;
            }
            if (debate.opposition_team_id && tournamentTeams.some(t => t._id === debate.opposition_team_id)) {
              tournamentPoints += debate.opposition_team_points || 0;
            }
          }

          totalWins += tournamentWins;
          totalPoints += tournamentPoints;
          tournamentCount++;
        }

        if (tournamentCount > 0) {
          schoolsWithPerformance.push({
            school_id: school._id,
            school_name: school.name,
            logo_url: school.logo_url,
            totalPoints,
            totalWins,
            tournamentCount,
            avgPoints: Math.round((totalPoints / tournamentCount) * 10) / 10,
            rankChange: 0,
          });
        }
      }
    }

    schoolsWithPerformance.sort((a, b) => {
      if (a.totalWins !== b.totalWins) return b.totalWins - a.totalWins;
      return b.totalPoints - a.totalPoints;
    });

    return schoolsWithPerformance.slice(0, 3).map((school, index) => ({
      ...school,
      rank: index + 1,
    }));
  },
});