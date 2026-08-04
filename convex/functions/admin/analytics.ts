import { internalQuery, mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";

const dateRangeValidator = v.optional(v.object({
  start: v.number(),
  end: v.number(),
}));

async function requireAdmin(ctx: any, token: string) {
  const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
    token,
  });

  if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
    throw new Error("Admin access required");
  }

  return sessionResult.user;
}

type DashboardOverview = {
  total_tournaments: number;
  active_tournaments: number;
  total_users: number;
  total_schools: number;
  total_debates: number;
  growth_metrics: {
    tournaments: number;
    users: number;
    schools: number;
  };
};

export const getDashboardOverview = query({
  args: {
    token: v.string(),
    date_range: dateRangeValidator,
  },
  handler: async (ctx, args): Promise<DashboardOverview> => {
    await requireAdmin(ctx, args.token);

    return await ctx.runQuery(internal.functions.admin.analytics.dashboardOverview, {
      date_range: args.date_range,
    });
  },
});

export const dashboardOverview = internalQuery({
  args: {
    date_range: dateRangeValidator,
  },
  handler: async (ctx, args): Promise<DashboardOverview> => {
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (30 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const allTournaments = await ctx.db.query("tournaments").collect();
    const activeTournaments = allTournaments.filter(t =>
      t.status === "published" || t.status === "inProgress"
    );

    const tournamentsInRange = allTournaments.filter(t =>
      t.created_at >= dateRange.start && t.created_at <= dateRange.end
    );

    const allUsers = await ctx.db.query("users").collect();
    const usersInRange = allUsers.filter(u =>
      u.created_at >= dateRange.start && u.created_at <= dateRange.end
    );

    const allSchools = await ctx.db.query("schools").collect();
    const schoolsInRange = allSchools.filter(s =>
      s.created_at >= dateRange.start && s.created_at <= dateRange.end
    );

    const allDebates = await ctx.db.query("debates").collect();

    const previousPeriodStart = dateRange.start - (dateRange.end - dateRange.start);
    const previousTournaments = allTournaments.filter(t =>
      t.created_at >= previousPeriodStart && t.created_at < dateRange.start
    );
    const previousUsers = allUsers.filter(u =>
      u.created_at >= previousPeriodStart && u.created_at < dateRange.start
    );
    const previousSchools = allSchools.filter(s =>
      s.created_at >= previousPeriodStart && s.created_at < dateRange.start
    );

    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      total_tournaments: allTournaments.length,
      active_tournaments: activeTournaments.length,
      total_users: allUsers.length,
      total_schools: allSchools.length,
      total_debates: allDebates.length,
      growth_metrics: {
        tournaments: Math.round(calculateGrowth(tournamentsInRange.length, previousTournaments.length) * 10) / 10,
        users: Math.round(calculateGrowth(usersInRange.length, previousUsers.length) * 10) / 10,
        schools: Math.round(calculateGrowth(schoolsInRange.length, previousSchools.length) * 10) / 10,
      },
    };
  },
});

type TournamentAnalytics = {
  tournament_trends: Array<{
    date: string;
    total: number;
    completed: number;
    in_progress: number;
    published: number;
  }>;
  format_distribution: Array<{
    format: string;
    count: number;
    percentage: number;
  }>;
  virtual_vs_physical: {
    virtual: number;
    physical: number;
  };
  participation_metrics: {
    schools_participated: number;
    total_students: number;
    school_participation_breakdown: Array<{
      school_name: string;
      students_count: number;
      tournaments_participated: number;
    }>;
  };
};

export const getTournamentAnalytics = query({
  args: {
    token: v.string(),
    date_range: dateRangeValidator,
    league_id: v.optional(v.id("leagues")),
  },
  handler: async (ctx, args): Promise<TournamentAnalytics> => {
    await requireAdmin(ctx, args.token);

    return await ctx.runQuery(internal.functions.admin.analytics.tournamentAnalytics, {
      date_range: args.date_range,
      league_id: args.league_id,
    });
  },
});

export const tournamentAnalytics = internalQuery({
  args: {
    date_range: dateRangeValidator,
    league_id: v.optional(v.id("leagues")),
  },
  handler: async (ctx, args): Promise<TournamentAnalytics> => {
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (90 * 24 * 60 * 60 * 1000),
      end: now,
    };

    let tournaments = await ctx.db.query("tournaments").collect();

    if (args.league_id) {
      tournaments = tournaments.filter(t => t.league_id === args.league_id);
    }

    tournaments = tournaments.filter(t =>
      t.created_at >= dateRange.start && t.created_at <= dateRange.end
    );

    const dailyData: Record<string, { total: number; completed: number; in_progress: number; published: number }> = {};

    tournaments.forEach(tournament => {
      const date = new Date(tournament.created_at).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { total: 0, completed: 0, in_progress: 0, published: 0 };
      }
      dailyData[date].total++;
      if (tournament.status === "completed") dailyData[date].completed++;
      if (tournament.status === "inProgress") dailyData[date].in_progress++;
      if (tournament.status === "published") dailyData[date].published++;
    });

    const tournament_trends = Object.entries(dailyData).map(([date, data]) => ({
      date,
      ...data,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const formatCounts: Record<string, number> = {};
    tournaments.forEach(t => {
      formatCounts[t.format] = (formatCounts[t.format] || 0) + 1;
    });

    const format_distribution = Object.entries(formatCounts).map(([format, count]) => ({
      format,
      count,
      percentage: tournaments.length > 0 ? Math.round((count / tournaments.length) * 100 * 10) / 10 : 0,
    }));

    const virtual_vs_physical = {
      virtual: tournaments.filter(t => t.is_virtual).length,
      physical: tournaments.filter(t => !t.is_virtual).length,
    };

    const teams = await ctx.db.query("teams").collect();
    const tournamentTeams = teams.filter(team =>
      tournaments.some(t => t._id === team.tournament_id)
    );

    const schoolIds = new Set<Id<"schools">>();
    const studentIds = new Set<Id<"users">>();

    tournamentTeams.forEach(team => {
      if (team.school_id) {
        schoolIds.add(team.school_id);
      }
      team.members.forEach(memberId => {
        studentIds.add(memberId);
      });
    });

    const schools = await Promise.all(
      Array.from(schoolIds).map(id => ctx.db.get(id))
    );
    const validSchools = schools.filter(Boolean);

    const schoolParticipationBreakdown = await Promise.all(
      validSchools.map(async (school) => {
        const schoolTeams = tournamentTeams.filter(team => team.school_id === school!._id);
        const schoolStudentIds = new Set<Id<"users">>();
        const schoolTournamentIds = new Set<Id<"tournaments">>();

        schoolTeams.forEach(team => {
          team.members.forEach(memberId => schoolStudentIds.add(memberId));
          schoolTournamentIds.add(team.tournament_id);
        });

        return {
          school_name: school!.name,
          students_count: schoolStudentIds.size,
          tournaments_participated: schoolTournamentIds.size,
        };
      })
    );

    return {
      tournament_trends,
      format_distribution,
      virtual_vs_physical,
      participation_metrics: {
        schools_participated: schoolIds.size,
        total_students: studentIds.size,
        school_participation_breakdown: schoolParticipationBreakdown.sort((a, b) => b.students_count - a.students_count),
      },
    };
  },
});

type UserAnalytics = {
  user_growth: Array<{
    date: string;
    students: number;
    volunteers: number;
    school_admins: number;
    admins: number;
    total: number;
  }>;
  role_distribution: Array<{
    role: string;
    count: number;
    percentage: number;
    verified_percentage: number;
  }>;
  engagement_metrics: {
    active_users: number;
    login_frequency: Array<{
      period: string;
      logins: number;
    }>;
    tournament_participation: Array<{
      role: string;
      participation_rate: number;
    }>;
  };
};

export const getUserAnalytics = query({
  args: {
    token: v.string(),
    date_range: dateRangeValidator,
  },
  handler: async (ctx, args): Promise<UserAnalytics> => {
    await requireAdmin(ctx, args.token);

    return await ctx.runQuery(internal.functions.admin.analytics.userAnalytics, {
      date_range: args.date_range,
    });
  },
});

export const userAnalytics = internalQuery({
  args: {
    date_range: dateRangeValidator,
  },
  handler: async (ctx, args): Promise<UserAnalytics> => {
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (90 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const allUsers = await ctx.db.query("users").collect();
    const usersInRange = allUsers.filter(u =>
      u.created_at >= dateRange.start && u.created_at <= dateRange.end
    );

    const dailyGrowth: Record<string, { students: number; volunteers: number; school_admins: number; admins: number; total: number }> = {};

    usersInRange.forEach(user => {
      const date = new Date(user.created_at).toISOString().split('T')[0];
      if (!dailyGrowth[date]) {
        dailyGrowth[date] = { students: 0, volunteers: 0, school_admins: 0, admins: 0, total: 0 };
      }

      if (user.role === "student") dailyGrowth[date].students++;
      else if (user.role === "volunteer") dailyGrowth[date].volunteers++;
      else if (user.role === "school_admin") dailyGrowth[date].school_admins++;
      else if (user.role === "admin") dailyGrowth[date].admins++;

      dailyGrowth[date].total++;
    });

    const user_growth = Object.entries(dailyGrowth).map(([date, data]) => ({
      date,
      ...data,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const roleCounts: Record<string, { total: number; verified: number }> = {};
    allUsers.forEach(user => {
      if (!roleCounts[user.role]) {
        roleCounts[user.role] = { total: 0, verified: 0 };
      }
      roleCounts[user.role].total++;
      if (user.verified) {
        roleCounts[user.role].verified++;
      }
    });

    const role_distribution = Object.entries(roleCounts).map(([role, data]) => ({
      role,
      count: data.total,
      percentage: allUsers.length > 0 ? Math.round((data.total / allUsers.length) * 100 * 10) / 10 : 0,
      verified_percentage: data.total > 0 ? Math.round((data.verified / data.total) * 100 * 10) / 10 : 0,
    }));

    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const activeUsers = allUsers.filter(u =>
      u.last_login_at && u.last_login_at >= thirtyDaysAgo
    ).length;

    const loginData: Record<string, number> = {};
    allUsers.forEach(user => {
      if (user.last_login_at && user.last_login_at >= thirtyDaysAgo) {
        const weeksAgo = Math.floor((now - user.last_login_at) / (7 * 24 * 60 * 60 * 1000));
        const period = `Week ${weeksAgo + 1}`;
        loginData[period] = (loginData[period] || 0) + 1;
      }
    });

    const login_frequency = Object.entries(loginData).map(([period, logins]) => ({
      period,
      logins,
    }));

    const teams = await ctx.db.query("teams").collect();
    const invitations = await ctx.db.query("tournament_invitations").collect();

    const participationByRole: Record<string, { participated: number; total: number }> = {};

    allUsers.forEach(user => {
      if (!participationByRole[user.role]) {
        participationByRole[user.role] = { participated: 0, total: 0 };
      }
      participationByRole[user.role].total++;

      const hasParticipated = teams.some(team => team.members.includes(user._id)) ||
        invitations.some(inv => inv.target_id === user._id && inv.status === "accepted");

      if (hasParticipated) {
        participationByRole[user.role].participated++;
      }
    });

    const tournament_participation = Object.entries(participationByRole).map(([role, data]) => ({
      role,
      participation_rate: data.total > 0 ? Math.round((data.participated / data.total) * 100 * 10) / 10 : 0,
    }));

    return {
      user_growth,
      role_distribution,
      engagement_metrics: {
        active_users: activeUsers,
        login_frequency,
        tournament_participation,
      },
    };
  },
});

type FinancialAnalytics = {
  revenue_trends: Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>;
  payment_distribution: Array<{
    method: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
  tournament_revenue: Array<{
    tournament_name: string;
    revenue: number;
    teams_count: number;
    fee_per_team: number;
  }>;
  outstanding_payments: {
    total_amount: number;
    count: number;
    by_tournament: Array<{
      tournament_name: string;
      amount: number;
      count: number;
    }>;
  };
  waiver_usage: {
    total_waivers: number;
    total_amount_waived: number;
    by_tournament: Array<{
      tournament_name: string;
      waivers_used: number;
      amount_waived: number;
    }>;
  };
  regional_revenue: Array<{
    country: string;
    revenue: number;
    tournaments: number;
  }>;
};

export const getFinancialAnalytics = query({
  args: {
    token: v.string(),
    date_range: dateRangeValidator,
    currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
  },
  handler: async (ctx, args): Promise<FinancialAnalytics> => {
    await requireAdmin(ctx, args.token);

    return await ctx.runQuery(internal.functions.admin.analytics.financialAnalytics, {
      date_range: args.date_range,
      currency: args.currency,
    });
  },
});

export const financialAnalytics = internalQuery({
  args: {
    date_range: dateRangeValidator,
    currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
  },
  handler: async (ctx, args): Promise<FinancialAnalytics> => {
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (90 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const payments = await ctx.db.query("payments").collect();
    const filteredPayments = payments.filter(p =>
      p.created_at >= dateRange.start && p.created_at <= dateRange.end &&
      (!args.currency || p.currency === args.currency)
    );

    const tournaments = await ctx.db.query("tournaments").collect();
    const teams = await ctx.db.query("teams").collect();

    const dailyRevenue: Record<string, { revenue: number; transactions: number }> = {};

    filteredPayments.forEach(payment => {
      if (payment.status === "completed") {
        const date = new Date(payment.created_at).toISOString().split('T')[0];
        if (!dailyRevenue[date]) {
          dailyRevenue[date] = { revenue: 0, transactions: 0 };
        }
        dailyRevenue[date].revenue += payment.amount;
        dailyRevenue[date].transactions++;
      }
    });

    const revenue_trends = Object.entries(dailyRevenue).map(([date, data]) => ({
      date,
      ...data,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const paymentMethods: Record<string, { count: number; amount: number }> = {};

    filteredPayments.forEach(payment => {
      if (payment.status === "completed") {
        if (!paymentMethods[payment.method]) {
          paymentMethods[payment.method] = { count: 0, amount: 0 };
        }
        paymentMethods[payment.method].count++;
        paymentMethods[payment.method].amount += payment.amount;
      }
    });

    const totalPaymentAmount = Object.values(paymentMethods).reduce((sum, data) => sum + data.amount, 0);

    const payment_distribution = Object.entries(paymentMethods).map(([method, data]) => ({
      method,
      count: data.count,
      amount: data.amount,
      percentage: totalPaymentAmount > 0 ? Math.round((data.amount / totalPaymentAmount) * 100 * 10) / 10 : 0,
    }));

    const tournamentRevenue: Record<Id<"tournaments">, { revenue: number; teams_count: number; fee: number }> = {};

    filteredPayments.forEach(payment => {
      if (payment.status === "completed" && payment.tournament_id) {
        if (!tournamentRevenue[payment.tournament_id]) {
          const tournament = tournaments.find(t => t._id === payment.tournament_id);
          const tournamentTeams = teams.filter(t => t.tournament_id === payment.tournament_id);
          tournamentRevenue[payment.tournament_id] = {
            revenue: 0,
            teams_count: tournamentTeams.length,
            fee: tournament?.fee || 0,
          };
        }
        tournamentRevenue[payment.tournament_id].revenue += payment.amount;
      }
    });

    const tournament_revenue = Object.entries(tournamentRevenue).map(([tournamentId, data]) => {
      const tournament = tournaments.find(t => t._id === tournamentId);
      return {
        tournament_name: tournament?.name || "Unknown Tournament",
        revenue: data.revenue,
        teams_count: data.teams_count,
        fee_per_team: data.fee,
      };
    });

    const pendingPayments = payments.filter(p => p.status === "pending");
    const outstandingByTournament: Record<Id<"tournaments">, { amount: number; count: number }> = {};

    pendingPayments.forEach(payment => {
      if (payment.tournament_id) {
        if (!outstandingByTournament[payment.tournament_id]) {
          outstandingByTournament[payment.tournament_id] = { amount: 0, count: 0 };
        }
        outstandingByTournament[payment.tournament_id].amount += payment.amount;
        outstandingByTournament[payment.tournament_id].count++;
      }
    });

    const outstanding_payments = {
      total_amount: pendingPayments.reduce((sum, p) => sum + p.amount, 0),
      count: pendingPayments.length,
      by_tournament: Object.entries(outstandingByTournament).map(([tournamentId, data]) => {
        const tournament = tournaments.find(t => t._id === tournamentId);
        return {
          tournament_name: tournament?.name || "Unknown Tournament",
          amount: data.amount,
          count: data.count,
        };
      }),
    };

    const waivedTeams = teams.filter(t => t.payment_status === "waived");
    const waiverByTournament: Record<Id<"tournaments">, { count: number; amount: number }> = {};

    waivedTeams.forEach(team => {
      const tournament = tournaments.find(t => t._id === team.tournament_id);
      if (tournament && tournament.fee) {
        if (!waiverByTournament[team.tournament_id]) {
          waiverByTournament[team.tournament_id] = { count: 0, amount: 0 };
        }
        waiverByTournament[team.tournament_id].count++;
        waiverByTournament[team.tournament_id].amount += tournament.fee;
      }
    });

    const waiver_usage = {
      total_waivers: waivedTeams.length,
      total_amount_waived: Object.values(waiverByTournament).reduce((sum, data) => sum + data.amount, 0),
      by_tournament: Object.entries(waiverByTournament).map(([tournamentId, data]) => {
        const tournament = tournaments.find(t => t._id === tournamentId);
        return {
          tournament_name: tournament?.name || "Unknown Tournament",
          waivers_used: data.count,
          amount_waived: data.amount,
        };
      }),
    };

    const schools = await ctx.db.query("schools").collect();
    const regionalRevenue: Record<string, { revenue: number; tournaments: Set<Id<"tournaments">> }> = {};

    filteredPayments.forEach(payment => {
      if (payment.status === "completed" && payment.school_id) {
        const school = schools.find(s => s._id === payment.school_id);
        if (school) {
          if (!regionalRevenue[school.country]) {
            regionalRevenue[school.country] = { revenue: 0, tournaments: new Set() };
          }
          regionalRevenue[school.country].revenue += payment.amount;
          if (payment.tournament_id) {
            regionalRevenue[school.country].tournaments.add(payment.tournament_id);
          }
        }
      }
    });

    const regional_revenue = Object.entries(regionalRevenue).map(([country, data]) => ({
      country,
      revenue: data.revenue,
      tournaments: data.tournaments.size,
    }));

    return {
      revenue_trends,
      payment_distribution,
      tournament_revenue,
      outstanding_payments,
      waiver_usage,
      regional_revenue,
    };
  },
});

type PerformanceAnalytics = {
  tournament_rankings: Array<{
    tournament_name: string;
    format: string;
    date: number;
    team_rankings: Array<{
      rank: number;
      school_name: string;
      team_name: string;
      total_points: number;
      wins: number;
      losses: number;
    }>;
    speaker_rankings: Array<{
      rank: number;
      speaker_name: string;
      school_name: string;
      total_points: number;
      average_score: number;
    }>;
  }>;
  cross_tournament_rankings: {
    top_schools: Array<{
      school_name: string;
      tournaments_participated: number;
      total_points: number;
      average_rank: number;
      consistency_score: number;
    }>;
    top_speakers: Array<{
      speaker_name: string;
      school_name: string;
      tournaments_participated: number;
      total_points: number;
      average_rank: number;
      best_rank: number;
    }>;
    top_teams: Array<{
      team_composition: string;
      school_name: string;
      tournaments_together: number;
      combined_points: number;
      win_rate: number;
    }>;
  };
  judge_performance: {
    consistency_scores: Array<{
      judge_name: string;
      consistency: number;
      debates_judged: number;
      tournaments_participated: number;
    }>;
    feedback_quality: Array<{
      judge_name: string;
      avg_feedback_score: number;
      total_feedback_received: number;
      response_time_avg: number;
    }>;
  };
};

export const getPerformanceAnalytics = query({
  args: {
    token: v.string(),
    date_range: dateRangeValidator,
    tournament_id: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args): Promise<PerformanceAnalytics> => {
    await requireAdmin(ctx, args.token);

    return await ctx.runQuery(internal.functions.admin.analytics.performanceAnalytics, {
      date_range: args.date_range,
      tournament_id: args.tournament_id,
    });
  },
});

export const performanceAnalytics = internalQuery({
  args: {
    date_range: dateRangeValidator,
    tournament_id: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args): Promise<PerformanceAnalytics> => {
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (365 * 24 * 60 * 60 * 1000),
      end: now,
    };

    let tournaments = await ctx.db.query("tournaments").collect();

    tournaments = tournaments.filter(t =>
      t.start_date >= dateRange.start &&
      t.start_date <= dateRange.end &&
      t.status === "completed"
    );

    if (args.tournament_id) {
      tournaments = tournaments.filter(t => t._id === args.tournament_id);
    }

    const teams = await ctx.db.query("teams").collect();
    const users = await ctx.db.query("users").collect();
    const schools = await ctx.db.query("schools").collect();
    const debates = await ctx.db.query("debates").collect();
    const judgingScores = await ctx.db.query("judging_scores").collect();
    const judgeFeedback = await ctx.db.query("judge_feedback").collect();

    const tournamentRankings = await Promise.all(
      tournaments.map(async (tournament) => {
        const tournamentTeams = teams.filter(t => t.tournament_id === tournament._id);
        const tournamentDebates = debates.filter(d => d.tournament_id === tournament._id);

        const teamStats = new Map<Id<"teams">, { wins: number; losses: number; totalPoints: number; }>();

        tournamentDebates.forEach(debate => {
          if (debate.status === "completed" && debate.winning_team_id) {
            const winningTeam = teamStats.get(debate.winning_team_id) || { wins: 0, losses: 0, totalPoints: 0 };
            winningTeam.wins++;
            if (debate.proposition_team_id === debate.winning_team_id && debate.proposition_team_points) {
              winningTeam.totalPoints += debate.proposition_team_points;
            } else if (debate.opposition_team_id === debate.winning_team_id && debate.opposition_team_points) {
              winningTeam.totalPoints += debate.opposition_team_points;
            }
            teamStats.set(debate.winning_team_id, winningTeam);

            const losingTeamId = debate.proposition_team_id === debate.winning_team_id ?
              debate.opposition_team_id : debate.proposition_team_id;

            if (losingTeamId) {
              const losingTeam = teamStats.get(losingTeamId) || { wins: 0, losses: 0, totalPoints: 0 };
              losingTeam.losses++;
              if (debate.proposition_team_id === losingTeamId && debate.proposition_team_points) {
                losingTeam.totalPoints += debate.proposition_team_points;
              } else if (debate.opposition_team_id === losingTeamId && debate.opposition_team_points) {
                losingTeam.totalPoints += debate.opposition_team_points;
              }
              teamStats.set(losingTeamId, losingTeam);
            }
          }
        });

        const teamRankings = Array.from(teamStats.entries())
          .map(([teamId, stats]) => {
            const team = tournamentTeams.find(t => t._id === teamId);
            const school = team?.school_id ? schools.find(s => s._id === team.school_id) : null;

            return {
              team_id: teamId,
              team_name: team?.name || "Unknown Team",
              school_name: school?.name || "Unknown School",
              wins: stats.wins,
              losses: stats.losses,
              total_points: stats.totalPoints,
            };
          })
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.total_points - a.total_points;
          })
          .map((team, index) => ({
            rank: index + 1,
            school_name: team.school_name,
            team_name: team.team_name,
            total_points: team.total_points,
            wins: team.wins,
            losses: team.losses,
          }));

        const speakerStats = new Map<Id<"users">, { totalPoints: number; totalScores: number; scoreCount: number; }>();

        const tournamentJudgingScores = judgingScores.filter(score =>
          tournamentDebates.some(d => d._id === score.debate_id)
        );

        tournamentJudgingScores.forEach(score => {
          if (score.speaker_scores) {
            score.speaker_scores.forEach(speakerScore => {
              const current = speakerStats.get(speakerScore.speaker_id) || { totalPoints: 0, totalScores: 0, scoreCount: 0 };
              current.totalPoints += speakerScore.score;
              current.totalScores += speakerScore.score;
              current.scoreCount++;
              speakerStats.set(speakerScore.speaker_id, current);
            });
          }
        });

        const speakerRankings = Array.from(speakerStats.entries())
          .map(([speakerId, stats]) => {
            const speaker = users.find(u => u._id === speakerId);
            const school = speaker?.school_id ? schools.find(s => s._id === speaker.school_id) : null;

            return {
              speaker_id: speakerId,
              speaker_name: speaker?.name || "Unknown Speaker",
              school_name: school?.name || "Unknown School",
              total_points: stats.totalPoints,
              average_score: stats.scoreCount > 0 ? stats.totalScores / stats.scoreCount : 0,
            };
          })
          .sort((a, b) => b.total_points - a.total_points)
          .map((speaker, index) => ({
            rank: index + 1,
            speaker_name: speaker.speaker_name,
            school_name: speaker.school_name,
            total_points: speaker.total_points,
            average_score: Math.round(speaker.average_score * 10) / 10,
          }));

        return {
          tournament_name: tournament.name,
          format: tournament.format,
          date: tournament.start_date,
          team_rankings: teamRankings.slice(0, 20),
          speaker_rankings: speakerRankings.slice(0, 20),
        };
      })
    );

    const schoolPerformance = new Map<Id<"schools">, {
      tournaments: number;
      totalPoints: number;
      ranks: number[];
      name: string;
    }>();

    const speakerPerformance = new Map<Id<"users">, {
      tournaments: number;
      totalPoints: number;
      ranks: number[];
      name: string;
      schoolName: string;
    }>();

    const teamCompositions = new Map<string, {
      tournaments: number;
      totalPoints: number;
      wins: number;
      total: number;
      schoolName: string;
    }>();

    tournamentRankings.forEach(tournament => {

      tournament.team_rankings.forEach(team => {
        const schoolId = schools.find(s => s.name === team.school_name)?._id;
        if (schoolId) {
          const current = schoolPerformance.get(schoolId) || {
            tournaments: 0,
            totalPoints: 0,
            ranks: [],
            name: team.school_name
          };
          current.tournaments++;
          current.totalPoints += team.total_points;
          current.ranks.push(team.rank);
          schoolPerformance.set(schoolId, current);
        }
      });

      tournament.speaker_rankings.forEach(speaker => {
        const speakerId = users.find(u => u.name === speaker.speaker_name)?._id;
        if (speakerId) {
          const current = speakerPerformance.get(speakerId) || {
            tournaments: 0,
            totalPoints: 0,
            ranks: [],
            name: speaker.speaker_name,
            schoolName: speaker.school_name
          };
          current.tournaments++;
          current.totalPoints += speaker.total_points;
          current.ranks.push(speaker.rank);
          speakerPerformance.set(speakerId, current);
        }
      });

      tournament.team_rankings.forEach(team => {
        const key = `${team.school_name}-Team`;
        const current = teamCompositions.get(key) || {
          tournaments: 0,
          totalPoints: 0,
          wins: 0,
          total: 0,
          schoolName: team.school_name
        };
        current.tournaments++;
        current.totalPoints += team.total_points;
        current.wins += team.wins;
        current.total += (team.wins + team.losses);
        teamCompositions.set(key, current);
      });
    });

    const topSchools = Array.from(schoolPerformance.entries())
      .map(([schoolId, data]) => {
        const avgRank = data.ranks.length > 0 ? data.ranks.reduce((sum, rank) => sum + rank, 0) / data.ranks.length : 999;
        const variance = data.ranks.length > 0 ?
          data.ranks.reduce((sum, rank) => sum + Math.pow(rank - avgRank, 2), 0) / data.ranks.length : 0;
        const consistencyScore = Math.max(0, 100 - Math.sqrt(variance));

        return {
          school_name: data.name,
          tournaments_participated: data.tournaments,
          total_points: data.totalPoints,
          average_rank: Math.round(avgRank * 10) / 10,
          consistency_score: Math.round(consistencyScore * 10) / 10,
        };
      })
      .sort((a, b) => a.average_rank - b.average_rank)
      .slice(0, 10);

    const topSpeakers = Array.from(speakerPerformance.entries())
      .map(([speakerId, data]) => {
        const avgRank = data.ranks.length > 0 ? data.ranks.reduce((sum, rank) => sum + rank, 0) / data.ranks.length : 999;
        const bestRank = data.ranks.length > 0 ? Math.min(...data.ranks) : 999;

        return {
          speaker_name: data.name,
          school_name: data.schoolName,
          tournaments_participated: data.tournaments,
          total_points: data.totalPoints,
          average_rank: Math.round(avgRank * 10) / 10,
          best_rank: bestRank,
        };
      })
      .sort((a, b) => a.average_rank - b.average_rank)
      .slice(0, 10);

    const topTeams = Array.from(teamCompositions.entries())
      .map(([composition, data]) => ({
        team_composition: composition,
        school_name: data.schoolName,
        tournaments_together: data.tournaments,
        combined_points: data.totalPoints,
        win_rate: data.total > 0 ? Math.round((data.wins / data.total) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 10);

    const judgeConsistency = new Map<Id<"users">, { scores: number[]; name: string; debatesJudged: number; tournaments: Set<Id<"tournaments">>; }>();

    judgingScores.forEach(score => {
      const judge = users.find(u => u._id === score.judge_id);
      if (!judge || judge.role !== "volunteer") return;

      const debate = debates.find(d => d._id === score.debate_id);
      if (!debate || !tournaments.some(t => t._id === debate.tournament_id)) return;

      const current = judgeConsistency.get(score.judge_id) || {
        scores: [],
        name: judge.name,
        debatesJudged: 0,
        tournaments: new Set(),
      };

      if (score.speaker_scores) {
        const avgScore = score.speaker_scores.reduce((sum, s) => sum + s.score, 0) / score.speaker_scores.length;
        current.scores.push(avgScore);
      }

      current.debatesJudged++;
      current.tournaments.add(debate.tournament_id);
      judgeConsistency.set(score.judge_id, current);
    });

    const consistencyScores = Array.from(judgeConsistency.entries())
      .map(([judgeId, data]) => {
        if (data.scores.length < 3) return null;

        const mean = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
        const variance = data.scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / data.scores.length;
        const standardDeviation = Math.sqrt(variance);
        const consistency = Math.max(0, 100 - (standardDeviation * 10));

        return {
          judge_name: data.name,
          consistency: Math.round(consistency * 10) / 10,
          debates_judged: data.debatesJudged,
          tournaments_participated: data.tournaments.size,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.consistency - a!.consistency)
      .slice(0, 15) as Array<{
      judge_name: string;
      consistency: number;
      debates_judged: number;
      tournaments_participated: number;
    }>;

    const judgeFeedbackQuality = new Map<Id<"users">, {
      feedbackScores: number[];
      name: string;
      responseTimes: number[];
    }>();

    judgeFeedback.forEach(feedback => {
      const judge = users.find(u => u._id === feedback.judge_id);
      if (!judge || judge.role !== "volunteer") return;

      const debate = debates.find(d => d._id === feedback.debate_id);
      if (!debate || !tournaments.some(t => t._id === debate.tournament_id)) return;

      const current = judgeFeedbackQuality.get(feedback.judge_id) || {
        feedbackScores: [],
        name: judge.name,
        responseTimes: [],
      };

      const avgScore = (feedback.clarity + feedback.fairness + feedback.knowledge + feedback.helpfulness) / 4;
      current.feedbackScores.push(avgScore);

      if (debate.start_time) {
        const responseTime = (feedback.submitted_at - debate.start_time) / (60 * 60 * 1000);
        if (responseTime > 0 && responseTime < 72) {
          current.responseTimes.push(responseTime);
        }
      }

      judgeFeedbackQuality.set(feedback.judge_id, current);
    });

    const feedbackQuality = Array.from(judgeFeedbackQuality.entries())
      .map(([judgeId, data]) => {
        const avgFeedbackScore = data.feedbackScores.length > 0 ?
          data.feedbackScores.reduce((sum, score) => sum + score, 0) / data.feedbackScores.length : 0;

        const avgResponseTime = data.responseTimes.length > 0 ?
          data.responseTimes.reduce((sum, time) => sum + time, 0) / data.responseTimes.length : 0;

        return {
          judge_name: data.name,
          avg_feedback_score: Math.round(avgFeedbackScore * 10) / 10,
          total_feedback_received: data.feedbackScores.length,
          response_time_avg: Math.round(avgResponseTime * 10) / 10,
        };
      })
      .filter(judge => judge.total_feedback_received >= 2)
      .sort((a, b) => b.avg_feedback_score - a.avg_feedback_score)
      .slice(0, 15);

    return {
      tournament_rankings: tournamentRankings.sort((a, b) => b.date - a.date),
      cross_tournament_rankings: {
        top_schools: topSchools,
        top_speakers: topSpeakers,
        top_teams: topTeams,
      },
      judge_performance: {
        consistency_scores: consistencyScores,
        feedback_quality: feedbackQuality,
      },
    };
  },
});

export const incrementViewCount = mutation({
  args: {
    access_token: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const reportShare = await ctx.db
      .query("report_shares")
      .withIndex("by_access_token", (q) => q.eq("access_token", args.access_token))
      .first();

    if (!reportShare) {
      throw new Error("Invalid access token");
    }

    if (reportShare.expires_at < Date.now()) {
      throw new Error("Report access has expired");
    }

    if (reportShare.allowed_views && reportShare.view_count >= reportShare.allowed_views) {
      throw new Error("Maximum views exceeded");
    }

    await ctx.db.patch(reportShare._id, {
      view_count: reportShare.view_count + 1,
    });
  },
});

export const generateShareableReport = mutation({
  args: {
    token: v.string(),
    report_config: v.object({
      title: v.string(),
      sections: v.array(v.string()),
      date_range: v.optional(v.object({
        start: v.number(),
        end: v.number(),
      })),
      filters: v.optional(v.object({
        tournament_id: v.optional(v.id("tournaments")),
        league_id: v.optional(v.id("leagues")),
        currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
      })),
    }),
    access_settings: v.object({
      expires_at: v.optional(v.number()),
      allowed_views: v.optional(v.number()),
      visible_to_roles: v.array(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<{
    share_url: string;
    access_token: string;
    expires_at: number;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const accessToken = Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join('');

    const expiresAt = args.access_settings.expires_at ||
      (Date.now() + (30 * 24 * 60 * 60 * 1000));

    const reportShareId = await ctx.db.insert("report_shares", {
      report_type: "tournament",
      report_id: JSON.stringify({
        config: args.report_config,
      }),
      access_token: accessToken,
      created_by: sessionResult.user.id,
      expires_at: expiresAt,
      allowed_views: args.access_settings.allowed_views,
      view_count: 0,
      created_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "system_setting_changed",
      resource_type: "report_shares",
      resource_id: reportShareId,
      description: `Created shareable analytics report: ${args.report_config.title}`,
    });

    const shareUrl = `${process.env.FRONTEND_SITE_URL}/reports/${accessToken}`;

    return {
      share_url: shareUrl,
      access_token: accessToken,
      expires_at: expiresAt,
    };
  },
});

export const exportAnalyticsData = query({
  args: {
    token: v.string(),
    export_format: v.union(v.literal("csv"), v.literal("excel"), v.literal("pdf")),
    sections: v.array(v.string()),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    filters: v.optional(v.object({
      tournament_id: v.optional(v.id("tournaments")),
      league_id: v.optional(v.id("leagues")),
      currency: v.optional(v.union(v.literal("RWF"), v.literal("USD"))),
    })),
  },
  handler: async (ctx, args): Promise<Record<string, any>> => {
    await requireAdmin(ctx, args.token);

    const exportData: Record<string, any> = {};

    if (args.sections.includes("overview")) {
      exportData.overview = await ctx.runQuery(internal.functions.admin.analytics.dashboardOverview, {
        date_range: args.date_range,
      });
    }

    if (args.sections.includes("tournaments")) {
      exportData.tournaments = await ctx.runQuery(internal.functions.admin.analytics.tournamentAnalytics, {
        date_range: args.date_range,
        league_id: args.filters?.league_id,
      });
    }

    if (args.sections.includes("users")) {
      exportData.users = await ctx.runQuery(internal.functions.admin.analytics.userAnalytics, {
        date_range: args.date_range,
      });
    }

    if (args.sections.includes("financial")) {
      exportData.financial = await ctx.runQuery(internal.functions.admin.analytics.financialAnalytics, {
        date_range: args.date_range,
        currency: args.filters?.currency,
      });
    }

    if (args.sections.includes("performance")) {
      exportData.performance = await ctx.runQuery(internal.functions.admin.analytics.performanceAnalytics, {
        date_range: args.date_range,
        tournament_id: args.filters?.tournament_id,
      });
    }

    return exportData;
  },
});