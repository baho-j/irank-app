import { query } from "../../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { Doc, Id } from "../../_generated/dataModel";

export const getSchoolPerformanceAnalytics = query({
  args: {
    token: v.string(),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    compare_to_previous_period: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    performance_trends: Array<{
      period: string;
      avg_team_rank: number;
      avg_speaker_score: number;
      win_rate: number;
      tournaments_participated: number;
      total_points: number;
    }>;
    student_development: Array<{
      student_id: Id<"users">;
      student_name: string;
      improvement_trajectory: {
        tournaments: Array<{
          tournament_name: string;
          date: number;
          speaker_rank: number;
          speaker_points: number;
          team_rank: number;
        }>;
        trend: "improving" | "declining" | "stable";
        improvement_rate: number;
      };
      current_performance: {
        avg_speaker_score: number;
        total_tournaments: number;
        best_rank: number;
        consistency_score: number;
      };
      predicted_next_performance: {
        likely_rank_range: { min: number; max: number };
        confidence: number;
        improvement_areas: string[];
      };
    }>;
    team_performance: Array<{
      team_id: Id<"teams">;
      team_name: string;
      tournament_id: Id<"tournaments">;
      tournament_name: string;
      performance: {
        rank: number;
        wins: number;
        total_points: number;
        avg_speaker_score: number;
        debates_count: number;
      };
      member_performances: Array<{
        student_id: Id<"users">;
        student_name: string;
        speaker_rank: number;
        speaker_points: number;
        avg_score: number;
        improvement_from_last: number;
      }>;
    }>;
    benchmarking: {
      school_rank_in_region: number;
      school_rank_by_type: number;
      similar_schools_comparison: Array<{
        school_name: string;
        school_type: string;
        avg_performance: number;
        student_count: number;
      }>;
      performance_percentile: number;
    };
    financial_analytics: {
      total_investment: number;
      cost_per_student: number;
      cost_per_tournament: number;
      roi_metrics: {
        tournaments_per_rwf: number;
        ranking_improvement_per_rwf: number;
      };
      payment_history: Array<{
        tournament_name: string;
        amount: number;
        date: number;
        currency: string;
        teams_registered: number;
      }>;
    };
    insights: Array<{
      type: "achievement" | "improvement" | "concern" | "opportunity";
      title: string;
      description: string;
      confidence: number;
      actionable_suggestions: string[];
    }>;
    summary_stats: {
      total_students: number;
      active_students: number;
      total_tournaments: number;
      avg_team_rank: number;
      trends: {
        students: number | null;
        tournaments: number | null;
        performance: number | null;
      };
    };
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const user = sessionResult.user;
    if (!user.school_id) {
      throw new Error("User not associated with a school");
    }

    const school = await ctx.db.get(user.school_id);
    if (!school) {
      throw new Error("School not found");
    }

    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (365 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const comparisonPeriod = args.compare_to_previous_period ? {
      start: dateRange.start - (dateRange.end - dateRange.start),
      end: dateRange.start,
    } : null;

    const tournaments = await ctx.db.query("tournaments")
      .filter((q) =>
        q.and(
          q.gte(q.field("start_date"), dateRange.start),
          q.lte(q.field("start_date"), dateRange.end),
          q.eq(q.field("status"), "completed")
        )
      )
      .collect();

    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q) => q.eq("school_id", user.school_id!))
      .collect();

    const relevantTeams = schoolTeams.filter(team =>
      tournaments.some(t => t._id === team.tournament_id)
    );

    const schoolStudents = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", user.school_id!).eq("role", "student")
      )
      .collect();

    const debates = await ctx.db.query("debates").collect();
    const judgingScores = await ctx.db.query("judging_scores").collect();

    const teamResults = await Promise.all(
      relevantTeams.map(async (team) => {
        const teamDebates = debates.filter(d =>
          d.tournament_id === team.tournament_id &&
          (d.proposition_team_id === team._id || d.opposition_team_id === team._id)
        );

        let wins = 0;
        let losses = 0;
        let totalPoints = 0;

        teamDebates.forEach(debate => {
          if (debate.status === "completed") {
            if (debate.winning_team_id === team._id) {
              wins++;
            } else if (debate.winning_team_id) {
              losses++;
            }

            if (debate.proposition_team_id === team._id && debate.proposition_team_points) {
              totalPoints += debate.proposition_team_points;
            } else if (debate.opposition_team_id === team._id && debate.opposition_team_points) {
              totalPoints += debate.opposition_team_points;
            }
          }
        });

        return {
          team,
          results: {
            wins,
            losses,
            team_points: totalPoints,
            debates_count: teamDebates.length,
          }
        };
      })
    );

    const speakerResults = await Promise.all(
      schoolStudents.map(async (student) => {
        const studentJudgingScores = judgingScores.filter(score =>
          score.speaker_scores?.some(s => s.speaker_id === student._id) &&
          tournaments.some(t => debates.some(d => d._id === score.debate_id && d.tournament_id === t._id))
        );

        const results = studentJudgingScores.map(score => {
          const speakerScore = score.speaker_scores?.find(s => s.speaker_id === student._id);
          const debate = debates.find(d => d._id === score.debate_id);
          const tournament = tournaments.find(t => t._id === debate?.tournament_id);

          return {
            tournament_id: tournament?._id,
            speaker_score: speakerScore?.total || 0,
            debate_date: debate?.start_time || tournament?.start_date || now,
          };
        });

        return { student, results };
      })
    );

    let trends = { students: null, tournaments: null, performance: null } as {
      students: number | null;
      tournaments: number | null;
      performance: number | null;
    };

    if (comparisonPeriod) {
      const prevTournaments = await ctx.db.query("tournaments")
        .filter((q) =>
          q.and(
            q.gte(q.field("start_date"), comparisonPeriod.start),
            q.lte(q.field("start_date"), comparisonPeriod.end),
            q.eq(q.field("status"), "completed")
          )
        )
        .collect();

      const prevStudentsCount = await ctx.db
        .query("users")
        .withIndex("by_school_id_role", (q) =>
          q.eq("school_id", user.school_id!).eq("role", "student")
        )
        .filter((q) => q.lte(q.field("created_at"), comparisonPeriod.end))
        .collect();

      const prevSchoolTeams = schoolTeams.filter(team =>
        prevTournaments.some(t => t._id === team.tournament_id)
      );

      if (prevStudentsCount.length > 0) {
        trends.students = ((schoolStudents.length - prevStudentsCount.length) / prevStudentsCount.length) * 100;
      }

      if (prevTournaments.length > 0) {
        trends.tournaments = ((tournaments.length - prevTournaments.length) / prevTournaments.length) * 100;
      }

      const currentAvgWins = teamResults.length > 0
        ? teamResults.reduce((sum, tr) => sum + tr.results.wins, 0) / teamResults.length
        : 0;

      const prevTeamResults = await Promise.all(
        prevSchoolTeams.map(async (team) => {
          const teamDebates = debates.filter(d =>
            d.tournament_id === team.tournament_id &&
            (d.proposition_team_id === team._id || d.opposition_team_id === team._id)
          );

          let wins = 0;
          teamDebates.forEach(debate => {
            if (debate.status === "completed" && debate.winning_team_id === team._id) {
              wins++;
            }
          });

          return wins;
        })
      );

      const prevAvgWins = prevTeamResults.length > 0
        ? prevTeamResults.reduce((sum, wins) => sum + wins, 0) / prevTeamResults.length
        : 0;

      if (prevAvgWins > 0) {
        trends.performance = ((currentAvgWins - prevAvgWins) / prevAvgWins) * 100;
      }
    }

    const performanceTrends = [];
    const quarters = Math.ceil((dateRange.end - dateRange.start) / (90 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < quarters; i++) {
      const periodStart = dateRange.start + (i * 90 * 24 * 60 * 60 * 1000);
      const periodEnd = Math.min(periodStart + (90 * 24 * 60 * 60 * 1000), dateRange.end);

      const periodTournaments = tournaments.filter(t =>
        t.start_date >= periodStart && t.start_date < periodEnd
      );

      if (periodTournaments.length === 0) continue;

      const periodTeamResults = teamResults.filter(({ team }) =>
        periodTournaments.some(t => t._id === team.tournament_id)
      );

      const periodSpeakerResults = speakerResults.flatMap(({ results }) =>
        results.filter(result =>
          periodTournaments.some(t => t._id === result.tournament_id)
        )
      );

      const avgTeamRank = periodTeamResults.length > 0
        ? periodTeamResults.reduce((sum, { results }) => {
        const totalGames = results.wins + results.losses;
        const winRate = totalGames > 0 ? results.wins / totalGames : 0;

        const approximateRank = Math.max(1, Math.ceil((1 - winRate) * 50));
        return sum + approximateRank;
      }, 0) / periodTeamResults.length
        : 0;

      const avgSpeakerScore = periodSpeakerResults.length > 0
        ? periodSpeakerResults.reduce((sum, result) => sum + result.speaker_score, 0) / periodSpeakerResults.length
        : 0;

      const totalWins = periodTeamResults.reduce((sum, { results }) => sum + results.wins, 0);
      const totalGames = periodTeamResults.reduce((sum, { results }) => sum + (results.wins + results.losses), 0);
      const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

      const totalPoints = periodTeamResults.reduce((sum, { results }) => sum + results.team_points, 0);

      performanceTrends.push({
        period: `Q${i + 1} ${new Date(periodStart).getFullYear()}`,
        avg_team_rank: Math.round(avgTeamRank * 10) / 10,
        avg_speaker_score: Math.round(avgSpeakerScore * 10) / 10,
        win_rate: Math.round(winRate * 10) / 10,
        tournaments_participated: periodTournaments.length,
        total_points: totalPoints,
      });
    }

    const studentDevelopment = await Promise.all(
      schoolStudents.map(async (student) => {
        const studentResults = speakerResults.find(sr => sr.student._id === student._id)?.results || [];

        if (studentResults.length === 0) {
          return {
            student_id: student._id,
            student_name: student.name,
            improvement_trajectory: {
              tournaments: [],
              trend: "stable" as const,
              improvement_rate: 0,
            },
            current_performance: {
              avg_speaker_score: 0,
              total_tournaments: 0,
              best_rank: 999,
              consistency_score: 0,
            },
            predicted_next_performance: {
              likely_rank_range: { min: 999, max: 999 },
              confidence: 0,
              improvement_areas: [],
            },
          };
        }

        const tournamentPerformances = await Promise.all(
          studentResults.map(async (result) => {
            const tournament = tournaments.find(t => t._id === result.tournament_id);
            const teamResult = teamResults.find(tr =>
              tr.team.members.includes(student._id) && tr.team.tournament_id === result.tournament_id
            );

            const maxScore = 30;
            const approximateRank = Math.max(1, Math.ceil((1 - (result.speaker_score / maxScore)) * 100));

            return {
              tournament_name: tournament?.name || "Unknown",
              date: result.debate_date,
              speaker_rank: approximateRank,
              speaker_points: result.speaker_score,
              team_rank: teamResult ? Math.ceil((1 - (teamResult.results.wins / Math.max(1, teamResult.results.wins + teamResult.results.losses))) * 50) : 999,
            };
          })
        );

        tournamentPerformances.sort((a, b) => a.date - b.date);

        let trend: "improving" | "declining" | "stable" = "stable";
        let improvementRate = 0;

        if (tournamentPerformances.length >= 2) {
          const firstHalf = tournamentPerformances.slice(0, Math.ceil(tournamentPerformances.length / 2));
          const secondHalf = tournamentPerformances.slice(Math.ceil(tournamentPerformances.length / 2));

          const firstHalfAvgRank = firstHalf.reduce((sum, p) => sum + p.speaker_rank, 0) / firstHalf.length;
          const secondHalfAvgRank = secondHalf.reduce((sum, p) => sum + p.speaker_rank, 0) / secondHalf.length;

          const rankChange = firstHalfAvgRank - secondHalfAvgRank;
          improvementRate = Math.abs(rankChange / firstHalfAvgRank) * 100;

          if (rankChange > firstHalfAvgRank * 0.1) {
            trend = "improving";
          } else if (rankChange < -firstHalfAvgRank * 0.1) {
            trend = "declining";
          }
        }

        const avgScore = studentResults.reduce((sum, r) => sum + r.speaker_score, 0) / studentResults.length;
        const bestRank = Math.min(...tournamentPerformances.map(p => p.speaker_rank));

        const ranks = tournamentPerformances.map(p => p.speaker_rank);
        const avgRank = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
        const variance = ranks.reduce((sum, rank) => sum + Math.pow(rank - avgRank, 2), 0) / ranks.length;
        const consistency = Math.max(0, 100 - Math.sqrt(variance));

        let predictedRankRange = { min: bestRank, max: Math.min(bestRank + 10, 999) };
        let confidence = 50;
        const improvementAreas: string[] = [];

        if (trend === "improving") {
          predictedRankRange = {
            min: Math.max(1, bestRank - Math.ceil(improvementRate * 0.2)),
            max: bestRank
          };
          confidence = Math.min(85, 60 + improvementRate);
        } else if (trend === "declining") {
          predictedRankRange = {
            min: bestRank,
            max: Math.min(999, bestRank + Math.ceil(improvementRate * 0.3))
          };
          confidence = Math.min(75, 50 + improvementRate * 0.5);
          improvementAreas.push("Focus on consistency", "Review recent feedback");
        }

        if (avgScore < 20) {
          improvementAreas.push("Work on content knowledge and argumentation");
        }
        if (consistency < 70) {
          improvementAreas.push("Focus on maintaining consistent performance");
        }
        if (tournamentPerformances.length < 3) {
          improvementAreas.push("Participate in more tournaments for experience");
        }

        return {
          student_id: student._id,
          student_name: student.name,
          improvement_trajectory: {
            tournaments: tournamentPerformances,
            trend,
            improvement_rate: Math.round(improvementRate * 10) / 10,
          },
          current_performance: {
            avg_speaker_score: Math.round(avgScore * 10) / 10,
            total_tournaments: studentResults.length,
            best_rank: bestRank,
            consistency_score: Math.round(consistency * 10) / 10,
          },
          predicted_next_performance: {
            likely_rank_range: predictedRankRange,
            confidence: Math.round(confidence),
            improvement_areas: improvementAreas,
          },
        };
      })
    );

    const teamPerformance = await Promise.all(
      relevantTeams.map(async (team) => {
        const tournament = tournaments.find(t => t._id === team.tournament_id);
        const results = teamResults.find(tr => tr.team._id === team._id)?.results;

        const memberPerformances = await Promise.all(
          team.members.map(async (memberId) => {
            const member = await ctx.db.get(memberId);
            const memberJudgingScores = judgingScores.filter(score =>
              score.speaker_scores?.some(s => s.speaker_id === memberId) &&
              debates.some(d => d._id === score.debate_id && d.tournament_id === team.tournament_id)
            );

            const memberScore = memberJudgingScores.length > 0
              ? memberJudgingScores.reduce((sum, score) => {
              const speakerScore = score.speaker_scores?.find(s => s.speaker_id === memberId);
              return sum + (speakerScore?.total || 0);
            }, 0) / memberJudgingScores.length
              : 0;

            const allMemberScores = judgingScores.filter(score =>
              score.speaker_scores?.some(s => s.speaker_id === memberId)
            );

            const previousScores = allMemberScores
              .filter(score => {
                const debate = debates.find(d => d._id === score.debate_id);
                const debateTournament = tournaments.find(t => t._id === debate?.tournament_id);
                return debateTournament && debateTournament.start_date < (tournament?.start_date || 0);
              })
              .sort((a, b) => {
                const debateA = debates.find(d => d._id === a.debate_id);
                const debateB = debates.find(d => d._id === b.debate_id);
                const tournamentA = tournaments.find(t => t._id === debateA?.tournament_id);
                const tournamentB = tournaments.find(t => t._id === debateB?.tournament_id);
                return (tournamentB?.start_date || 0) - (tournamentA?.start_date || 0);
              });

            const previousScore = previousScores.length > 0
              ? previousScores[0].speaker_scores?.find(s => s.speaker_id === memberId)?.total || 0
              : 0;

            const improvementFromLast = memberScore - previousScore;

            const approximateRank = Math.max(1, Math.ceil((1 - (memberScore / 30)) * 100));

            return {
              student_id: memberId,
              student_name: member?.name || "Unknown",
              speaker_rank: approximateRank,
              speaker_points: memberScore,
              avg_score: memberScore,
              improvement_from_last: Math.round(improvementFromLast * 10) / 10,
            };
          })
        );

        const teamRank = results ? Math.ceil((1 - (results.wins / Math.max(1, results.wins + results.losses))) * 50) : 999;

        return {
          team_id: team._id,
          team_name: team.name,
          tournament_id: team.tournament_id,
          tournament_name: tournament?.name || "Unknown",
          performance: {
            rank: teamRank,
            wins: results?.wins || 0,
            total_points: results?.team_points || 0,
            avg_speaker_score: memberPerformances.reduce((sum, m) => sum + m.avg_score, 0) / memberPerformances.length,
            debates_count: results?.debates_count || 0,
          },
          member_performances: memberPerformances.sort((a, b) => a.speaker_rank - b.speaker_rank),
        };
      })
    );

    const allSchools = await ctx.db.query("schools")
      .filter((q) => q.eq(q.field("country"), school.country))
      .collect();

    const schoolsByType = allSchools.filter(s => s.type === school.type);

    const similarSchoolsData = await Promise.all(
      schoolsByType.slice(0, 10).map(async (similarSchool) => {
        if (similarSchool._id === school._id) return null;

        const similarSchoolTeams = await ctx.db
          .query("teams")
          .withIndex("by_school_id", (q) => q.eq("school_id", similarSchool._id))
          .collect();

        const similarSchoolDebates = debates.filter(debate =>
          similarSchoolTeams.some(team =>
            team._id === debate.proposition_team_id || team._id === debate.opposition_team_id
          )
        );

        let schoolWins = 0;
        let schoolTotal = 0;

        similarSchoolDebates.forEach(debate => {
          if (debate.status === "completed") {
            const isSchoolTeam = similarSchoolTeams.some(team => team._id === debate.winning_team_id);
            if (isSchoolTeam) schoolWins++;
            schoolTotal++;
          }
        });

        const avgPerformance = schoolTotal > 0 ? (schoolWins / schoolTotal) * 1000 : 0;

        const studentCount = await ctx.db
          .query("users")
          .withIndex("by_school_id_role", (q) =>
            q.eq("school_id", similarSchool._id).eq("role", "student")
          )
          .collect();

        return {
          school_name: similarSchool.name,
          school_type: similarSchool.type,
          avg_performance: Math.round(avgPerformance),
          student_count: studentCount.length,
        };
      })
    );

    const similarSchools = similarSchoolsData.filter(Boolean) as any[];

    const schoolWins = teamResults.reduce((sum, { results }) => sum + results.wins, 0);
    const schoolTotal = teamResults.reduce((sum, { results }) => sum + (results.wins + results.losses), 0);
    const schoolAvgPerformance = schoolTotal > 0 ? (schoolWins / schoolTotal) * 1000 : 0;

    const schoolsBetter = similarSchools.filter(s => s.avg_performance > schoolAvgPerformance).length;
    const performancePercentile = similarSchools.length > 0
      ? ((similarSchools.length - schoolsBetter) / similarSchools.length) * 100
      : 50;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_school_id", (q) => q.eq("school_id", user.school_id!))
      .collect();

    const relevantPayments = payments.filter(payment =>
      payment.created_at >= dateRange.start &&
      payment.created_at <= dateRange.end &&
      payment.status === "completed"
    );

    const totalInvestment = relevantPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const uniqueTournaments = new Set(relevantPayments.map(p => p.tournament_id)).size;
    const totalTeamsRegistered = relevantTeams.length;

    const paymentHistory = await Promise.all(
      relevantPayments.map(async (payment) => {
        const tournament = await ctx.db.get(payment.tournament_id);
        const tournamentTeams = relevantTeams.filter(t => t.tournament_id === payment.tournament_id);

        return {
          tournament_name: tournament?.name || "Unknown",
          amount: payment.amount,
          date: payment.created_at,
          currency: payment.currency,
          teams_registered: tournamentTeams.length,
        };
      })
    );

    const insights: any[] = [];

    const topPerformers = studentDevelopment
      .filter(s => s.current_performance.best_rank <= 10)
      .sort((a, b) => a.current_performance.best_rank - b.current_performance.best_rank);

    if (topPerformers.length > 0) {
      insights.push({
        type: "achievement",
        title: `Top 10 Performers: ${topPerformers.length} students`,
        description: `${topPerformers[0].student_name} achieved rank #${topPerformers[0].current_performance.best_rank}`,
        confidence: 95,
        actionable_suggestions: [
          "Celebrate and showcase these achievements",
          "Have top performers mentor newer students",
          "Consider entering them in higher-level competitions"
        ],
      });
    }

    const improvingStudents = studentDevelopment.filter(s => s.improvement_trajectory.trend === "improving");
    if (improvingStudents.length > 0) {
      insights.push({
        type: "improvement",
        title: `${improvingStudents.length} students showing improvement`,
        description: `Average improvement rate: ${(improvingStudents.reduce((sum, s) => sum + s.improvement_trajectory.improvement_rate, 0) / improvingStudents.length).toFixed(1)}%`,
        confidence: 80,
        actionable_suggestions: [
          "Continue current coaching methods",
          "Document what's working well",
          "Share successful strategies with other students"
        ],
      });
    }

    const decliningStudents = studentDevelopment.filter(s => s.improvement_trajectory.trend === "declining");
    if (decliningStudents.length > 0) {
      insights.push({
        type: "concern",
        title: `${decliningStudents.length} students showing decline`,
        description: "Some students may need additional support",
        confidence: 75,
        actionable_suggestions: [
          "Review individual feedback and identify common issues",
          "Provide additional coaching or mentoring",
          "Consider adjusting tournament participation strategy"
        ],
      });
    }

    if (performancePercentile > 75) {
      insights.push({
        type: "opportunity",
        title: "School performing above average",
        description: `Your school is in the ${Math.round(performancePercentile)}th percentile`,
        confidence: 85,
        actionable_suggestions: [
          "Consider participating in higher-tier competitions",
          "Share your school's success strategies with the community",
          "Expand your debate program"
        ],
      });
    }

    if (totalInvestment > 0 && uniqueTournaments > 0) {
      const costPerTournament = totalInvestment / uniqueTournaments;
      const avgTournamentFee = costPerTournament / (totalTeamsRegistered / uniqueTournaments || 1);

      if (avgTournamentFee > 50000) {
        insights.push({
          type: "opportunity",
          title: "High tournament participation costs",
          description: `Average cost per tournament: ${avgTournamentFee.toLocaleString()} RWF`,
          confidence: 70,
          actionable_suggestions: [
            "Look for tournaments with reduced fees for multiple teams",
            "Consider hosting your own tournament to offset costs",
            "Seek sponsorship opportunities"
          ],
        });
      }
    }

    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    const recentTournaments = await ctx.db.query("tournaments")
      .filter((q) =>
        q.and(
          q.gte(q.field("start_date"), sixMonthsAgo),
          q.lte(q.field("start_date"), now)
        )
      )
      .collect();

    const recentTeams = schoolTeams.filter(team =>
      recentTournaments.some(t => t._id === team.tournament_id)
    );

    const activeStudentIds = new Set();
    recentTeams.forEach(team => {
      team.members.forEach(memberId => activeStudentIds.add(memberId));
    });

    return {
      performance_trends: performanceTrends,
      student_development: studentDevelopment,
      team_performance: teamPerformance,
      benchmarking: {
        school_rank_in_region: schoolsBetter + 1,
        school_rank_by_type: schoolsBetter + 1,
        similar_schools_comparison: similarSchools,
        performance_percentile: Math.round(performancePercentile),
      },
      financial_analytics: {
        total_investment: totalInvestment,
        cost_per_student: schoolStudents.length > 0 ? totalInvestment / schoolStudents.length : 0,
        cost_per_tournament: uniqueTournaments > 0 ? totalInvestment / uniqueTournaments : 0,
        roi_metrics: {
          tournaments_per_rwf: totalInvestment > 0 ? uniqueTournaments / (totalInvestment / 1000) : 0,
          ranking_improvement_per_rwf: totalInvestment > 0 && performanceTrends.length >= 2
            ? (performanceTrends[performanceTrends.length - 1].avg_team_rank - performanceTrends[0].avg_team_rank) / (totalInvestment / 1000)
            : 0,
        },
        payment_history: paymentHistory.sort((a, b) => b.date - a.date),
      },
      insights: insights,
      summary_stats: {
        total_students: schoolStudents.length,
        active_students: activeStudentIds.size,
        total_tournaments: tournaments.length,
        avg_team_rank: teamResults.length > 0
          ? teamResults.reduce((sum, { results }) => {
          const totalGames = results.wins + results.losses;
          const winRate = totalGames > 0 ? results.wins / totalGames : 0;
          return sum + Math.max(1, Math.ceil((1 - winRate) * 50));
        }, 0) / teamResults.length
          : 0,
        trends: trends,
      },
    };
  },
});

export const getSchoolOperationalAnalytics = query({
  args: {
    token: v.string(),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{
    student_engagement: {
      total_students: number;
      active_students: number;
      inactive_students: number;
      new_registrations: number;
      dropout_rate: number;
      engagement_trends: Array<{
        period: string;
        active_count: number;
        participation_rate: number;
        tournament_signups: number;
      }>;
      student_activity_distribution: Array<{
        activity_level: "high" | "medium" | "low" | "inactive";
        count: number;
        percentage: number;
      }>;
    };
    resource_utilization: {
      tournaments_participated: number;
      teams_formed: number;
      avg_team_size: number;
      team_formation_patterns: Array<{
        tournament_name: string;
        teams_registered: number;
        students_participated: number;
        formation_efficiency: number;
      }>;
    };
    seasonal_trends: {
      performance_by_season: Array<{
        season: "Q1" | "Q2" | "Q3" | "Q4";
        year: number;
        tournaments_participated: number;
        avg_performance: number;
        student_participation: number;
        improvement_rate: number;
      }>;
      tournament_preferences: Array<{
        tournament_format: string;
        participation_count: number;
        avg_performance: number;
        preference_score: number;
      }>;
    };
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const user = sessionResult.user;
    if (!user.school_id) {
      throw new Error("User not associated with a school");
    }

    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (365 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const schoolStudents = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", user.school_id!).eq("role", "student")
      )
      .collect();

    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q) => q.eq("school_id", user.school_id!))
      .collect();

    const tournaments = await Promise.all(
      schoolTeams.map(async (team) => {
        return await ctx.db.get(team.tournament_id);
      })
    );

    const validTournaments = tournaments.filter(Boolean).filter(t =>
      t!.start_date >= dateRange.start && t!.start_date <= dateRange.end
    ) as Doc<"tournaments">[];

    const relevantTeams = schoolTeams.filter(team =>
      validTournaments.some(t => t._id === team.tournament_id)
    );

    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);

    const activeStudents = schoolStudents.filter(student => {
      const recentParticipation = relevantTeams.some(team =>
        team.members.includes(student._id) &&
        validTournaments.find(t => t._id === team.tournament_id && t.start_date >= thirtyDaysAgo)
      );
      return recentParticipation || (student.last_login_at && student.last_login_at >= thirtyDaysAgo);
    });

    const newRegistrations = schoolStudents.filter(student =>
      student.created_at >= dateRange.start && student.created_at <= dateRange.end
    );

    const previousPeriodStudents = schoolStudents.filter(student =>
      student.created_at < dateRange.start
    );

    const activeInPreviousPeriod = previousPeriodStudents.filter(student => {
      return relevantTeams.some(team =>
        team.members.includes(student._id) &&
        validTournaments.find(t => t._id === team.tournament_id && t.start_date < sixtyDaysAgo)
      );
    });

    const stillActive = activeInPreviousPeriod.filter(student =>
      activeStudents.some(active => active._id === student._id)
    );

    const dropoutRate = activeInPreviousPeriod.length > 0
      ? ((activeInPreviousPeriod.length - stillActive.length) / activeInPreviousPeriod.length) * 100
      : 0;

    const engagementTrends = [];
    const months = Math.ceil((dateRange.end - dateRange.start) / (30 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < months; i++) {
      const periodStart = dateRange.start + (i * 30 * 24 * 60 * 60 * 1000);
      const periodEnd = Math.min(periodStart + (30 * 24 * 60 * 60 * 1000), dateRange.end);

      const periodTournaments = validTournaments.filter(t =>
        t.start_date >= periodStart && t.start_date < periodEnd
      );

      const periodTeams = relevantTeams.filter(team =>
        periodTournaments.some(t => t._id === team.tournament_id)
      );

      const uniqueStudents = new Set();
      periodTeams.forEach(team => {
        team.members.forEach(memberId => uniqueStudents.add(memberId));
      });

      const tournamentSignups = periodTeams.length;
      const participationRate = schoolStudents.length > 0
        ? (uniqueStudents.size / schoolStudents.length) * 100
        : 0;

      engagementTrends.push({
        period: new Date(periodStart).toISOString().slice(0, 7),
        active_count: uniqueStudents.size,
        participation_rate: Math.round(participationRate * 10) / 10,
        tournament_signups: tournamentSignups,
      });
    }

    const activityLevels = new Map<string, number>();
    schoolStudents.forEach(student => {
      const studentTeams = relevantTeams.filter(team => team.members.includes(student._id));
      const participationCount = studentTeams.length;

      let level: "high" | "medium" | "low" | "inactive";
      if (participationCount === 0) {
        level = "inactive";
      } else if (participationCount >= 5) {
        level = "high";
      } else if (participationCount >= 2) {
        level = "medium";
      } else {
        level = "low";
      }

      activityLevels.set(level, (activityLevels.get(level) || 0) + 1);
    });

    const studentActivityDistribution = Array.from(activityLevels.entries()).map(([level, count]) => ({
      activity_level: level as "high" | "medium" | "low" | "inactive",
      count,
      percentage: Math.round((count / schoolStudents.length) * 100 * 10) / 10,
    }));

    const teamFormationPatterns = await Promise.all(
      validTournaments.map(async (tournament) => {
        const tournamentTeams = relevantTeams.filter(team => team.tournament_id === tournament._id);
        const studentsParticipated = new Set();
        tournamentTeams.forEach(team => {
          team.members.forEach(memberId => studentsParticipated.add(memberId));
        });

        const formationEfficiency = schoolStudents.length > 0
          ? (studentsParticipated.size / schoolStudents.length) * 100
          : 0;

        return {
          tournament_name: tournament.name,
          teams_registered: tournamentTeams.length,
          students_participated: studentsParticipated.size,
          formation_efficiency: Math.round(formationEfficiency * 10) / 10,
        };
      })
    );

    const seasonalPerformance = [];
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];
    const debates = await ctx.db.query("debates").collect();

    for (const year of years) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        const quarterStart = new Date(year, (quarter - 1) * 3, 1).getTime();
        const quarterEnd = new Date(year, quarter * 3, 0).getTime();

        const quarterTournaments = validTournaments.filter(t =>
          t.start_date >= quarterStart && t.start_date <= quarterEnd
        );

        if (quarterTournaments.length === 0) continue;

        const quarterTeams = relevantTeams.filter(team =>
          quarterTournaments.some(t => t._id === team.tournament_id)
        );

        let quarterWins = 0;
        let quarterTotal = 0;

        quarterTeams.forEach(team => {
          const teamDebates = debates.filter(d =>
            d.tournament_id === team.tournament_id &&
            (d.proposition_team_id === team._id || d.opposition_team_id === team._id)
          );

          teamDebates.forEach(debate => {
            if (debate.status === "completed") {
              if (debate.winning_team_id === team._id) {
                quarterWins++;
              }
              quarterTotal++;
            }
          });
        });

        const avgPerformance = quarterTotal > 0 ? (quarterWins / quarterTotal) * 100 : 0;

        const uniqueStudents = new Set();
        quarterTeams.forEach(team => {
          team.members.forEach(memberId => uniqueStudents.add(memberId));
        });

        const prevQuarterStart = quarterStart - (90 * 24 * 60 * 60 * 1000);
        const prevQuarterEnd = quarterStart;
        const prevQuarterTournaments = validTournaments.filter(t =>
          t.start_date >= prevQuarterStart && t.start_date < prevQuarterEnd
        );

        const prevQuarterTeams = relevantTeams.filter(team =>
          prevQuarterTournaments.some(t => t._id === team.tournament_id)
        );

        let prevQuarterWins = 0;
        let prevQuarterTotal = 0;

        prevQuarterTeams.forEach(team => {
          const teamDebates = debates.filter(d =>
            d.tournament_id === team.tournament_id &&
            (d.proposition_team_id === team._id || d.opposition_team_id === team._id)
          );

          teamDebates.forEach(debate => {
            if (debate.status === "completed") {
              if (debate.winning_team_id === team._id) {
                prevQuarterWins++;
              }
              prevQuarterTotal++;
            }
          });
        });

        const prevAvgPerformance = prevQuarterTotal > 0 ? (prevQuarterWins / prevQuarterTotal) * 100 : 0;

        const improvementRate = prevAvgPerformance > 0
          ? ((avgPerformance - prevAvgPerformance) / prevAvgPerformance) * 100
          : 0;

        seasonalPerformance.push({
          season: `Q${quarter}` as "Q1" | "Q2" | "Q3" | "Q4",
          year: year,
          tournaments_participated: quarterTournaments.length,
          avg_performance: Math.round(avgPerformance),
          student_participation: uniqueStudents.size,
          improvement_rate: Math.round(improvementRate * 10) / 10,
        });
      }
    }

    const formatPreferences = new Map<string, { count: number; performance: number[] }>();

    for (const tournament of validTournaments) {
      const tournamentTeams = relevantTeams.filter(team => team.tournament_id === tournament._id);

      if (!formatPreferences.has(tournament.format)) {
        formatPreferences.set(tournament.format, { count: 0, performance: [] });
      }

      const formatData = formatPreferences.get(tournament.format)!;
      formatData.count += tournamentTeams.length;

      let tournamentWins = 0;
      let tournamentTotal = 0;

      tournamentTeams.forEach(team => {
        const teamDebates = debates.filter(d =>
          d.tournament_id === team.tournament_id &&
          (d.proposition_team_id === team._id || d.opposition_team_id === team._id)
        );

        teamDebates.forEach(debate => {
          if (debate.status === "completed") {
            if (debate.winning_team_id === team._id) {
              tournamentWins++;
            }
            tournamentTotal++;
          }
        });
      });

      const tournamentPerformance = tournamentTotal > 0 ? (tournamentWins / tournamentTotal) * 100 : 0;
      formatData.performance.push(tournamentPerformance);
    }

    const tournamentPreferences = Array.from(formatPreferences.entries()).map(([format, data]) => {
      const avgPerformance = data.performance.length > 0
        ? data.performance.reduce((sum, perf) => sum + perf, 0) / data.performance.length
        : 0;

      const preferenceScore = (data.count * 0.6) + (avgPerformance * 0.4);

      return {
        tournament_format: format,
        participation_count: data.count,
        avg_performance: Math.round(avgPerformance),
        preference_score: Math.round(preferenceScore * 10) / 10,
      };
    }).sort((a, b) => b.preference_score - a.preference_score);

    return {
      student_engagement: {
        total_students: schoolStudents.length,
        active_students: activeStudents.length,
        inactive_students: schoolStudents.length - activeStudents.length,
        new_registrations: newRegistrations.length,
        dropout_rate: Math.round(dropoutRate * 10) / 10,
        engagement_trends: engagementTrends,
        student_activity_distribution: studentActivityDistribution,
      },
      resource_utilization: {
        tournaments_participated: validTournaments.length,
        teams_formed: relevantTeams.length,
        avg_team_size: relevantTeams.length > 0
          ? Math.round((relevantTeams.reduce((sum, team) => sum + team.members.length, 0) / relevantTeams.length) * 10) / 10
          : 0,
        team_formation_patterns: teamFormationPatterns,
      },
      seasonal_trends: {
        performance_by_season: seasonalPerformance,
        tournament_preferences: tournamentPreferences,
      },
    };
  },
});

export const exportSchoolAnalyticsData = query({
  args: {
    token: v.string(),
    export_format: v.union(v.literal("csv"), v.literal("excel"), v.literal("pdf")),
    sections: v.array(v.string()),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<Record<string, any>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const exportData: Record<string, any> = {};

    if (args.sections.includes("performance")) {
      const performanceData = await ctx.runQuery(api.functions.school.analytics.getSchoolPerformanceAnalytics, {
        token: args.token,
        date_range: args.date_range,
      });

      exportData.performance_trends = performanceData.performance_trends;
      exportData.student_development = performanceData.student_development.map(student => ({
        student_name: student.student_name,
        avg_speaker_score: student.current_performance.avg_speaker_score,
        total_tournaments: student.current_performance.total_tournaments,
        best_rank: student.current_performance.best_rank,
        consistency_score: student.current_performance.consistency_score,
        trend: student.improvement_trajectory.trend,
        improvement_rate: student.improvement_trajectory.improvement_rate,
        predicted_min_rank: student.predicted_next_performance.likely_rank_range.min,
        predicted_max_rank: student.predicted_next_performance.likely_rank_range.max,
        confidence: student.predicted_next_performance.confidence,
      }));
      exportData.team_performance = performanceData.team_performance.map(team => ({
        team_name: team.team_name,
        tournament_name: team.tournament_name,
        rank: team.performance.rank,
        wins: team.performance.wins,
        total_points: team.performance.total_points,
        avg_speaker_score: team.performance.avg_speaker_score,
        debates_count: team.performance.debates_count,
      }));
      exportData.financial_summary = {
        total_investment: performanceData.financial_analytics.total_investment,
        cost_per_student: performanceData.financial_analytics.cost_per_student,
        cost_per_tournament: performanceData.financial_analytics.cost_per_tournament,
      };
    }

    if (args.sections.includes("operational")) {
      const operationalData = await ctx.runQuery(api.functions.school.analytics.getSchoolOperationalAnalytics, {
        token: args.token,
        date_range: args.date_range,
      });

      exportData.engagement_summary = {
        total_students: operationalData.student_engagement.total_students,
        active_students: operationalData.student_engagement.active_students,
        dropout_rate: operationalData.student_engagement.dropout_rate,
        new_registrations: operationalData.student_engagement.new_registrations,
      };
      exportData.engagement_trends = operationalData.student_engagement.engagement_trends;
      exportData.resource_utilization = operationalData.resource_utilization;
      exportData.seasonal_performance = operationalData.seasonal_trends.performance_by_season;
      exportData.tournament_preferences = operationalData.seasonal_trends.tournament_preferences;
    }

    return exportData;
  },
});

export const getSchoolAchievementsAndBadges = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    achievements: Array<{
      id: string;
      title: string;
      description: string;
      type: "performance" | "participation" | "improvement" | "milestone";
      earned_date: number;
      criteria_met: boolean;
      progress: number;
      icon: string;
      rarity: "common" | "rare" | "epic" | "legendary";
    }>;
    available_badges: Array<{
      id: string;
      title: string;
      description: string;
      criteria: string;
      progress: number;
      max_progress: number;
      locked: boolean;
    }>;
    school_level: {
      current_level: number;
      experience_points: number;
      points_to_next_level: number;
      level_benefits: string[];
    };
    leaderboard_position: {
      regional_rank: number;
      national_rank: number;
      improvement_rank: number;
    };
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const user = sessionResult.user;
    if (!user.school_id) {
      throw new Error("User not associated with a school");
    }

    const school = await ctx.db.get(user.school_id);
    if (!school) {
      throw new Error("School not found");
    }

    const schoolTeams = await ctx.db
      .query("teams")
      .withIndex("by_school_id", (q) => q.eq("school_id", user.school_id!))
      .collect();

    const debates = await ctx.db.query("debates").collect();

    let totalWins = 0;
    let totalDebates = 0;
    const topRanks: number[] = [];

    schoolTeams.forEach(team => {
      const teamDebates = debates.filter(d =>
        (d.proposition_team_id === team._id || d.opposition_team_id === team._id) &&
        d.status === "completed"
      );

      teamDebates.forEach(debate => {
        totalDebates++;
        if (debate.winning_team_id === team._id) {
          totalWins++;
        }
      });

      const teamWins = teamDebates.filter(d => d.winning_team_id === team._id).length;
      const teamTotal = teamDebates.length;
      if (teamTotal > 0) {
        const winRate = teamWins / teamTotal;
        const approximateRank = Math.max(1, Math.ceil((1 - winRate) * 50));
        topRanks.push(approximateRank);
      }
    });

    const schoolStudents = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", user.school_id!).eq("role", "student")
      )
      .collect();

    const achievements = [];
    const now = Date.now();

    const bestRanks = topRanks.filter(rank => rank <= 3);
    if (bestRanks.length >= 1) {
      achievements.push({
        id: "first_podium",
        title: "First Podium Finish",
        description: "Achieved a top 3 ranking in a tournament",
        type: "performance" as const,
        earned_date: now,
        criteria_met: true,
        progress: 100,
        icon: "trophy",
        rarity: "common" as const,
      });
    }

    const judgingScores = await ctx.db.query("judging_scores").collect();
    const topSpeakers = judgingScores.filter(score =>
      score.speaker_scores?.some(s =>
        schoolStudents.some(student => student._id === s.speaker_id) &&
        s.total >= 70
      )
    );

    if (topSpeakers.length >= 1) {
      achievements.push({
        id: "top_speaker",
        title: "Rising Star",
        description: "Had a student achieve excellent speaker performance",
        type: "performance" as const,
        earned_date: now,
        criteria_met: true,
        progress: 100,
        icon: "star",
        rarity: "rare" as const,
      });
    }

    const totalTournaments = new Set(schoolTeams.map(team => team.tournament_id)).size;
    if (totalTournaments >= 5) {
      achievements.push({
        id: "tournament_veteran",
        title: "Tournament Veteran",
        description: "Participated in 5 or more tournaments",
        type: "participation" as const,
        earned_date: now,
        criteria_met: true,
        progress: 100,
        icon: "calendar",
        rarity: "common" as const,
      });
    }

    if (totalTournaments >= 20) {
      achievements.push({
        id: "tournament_champion",
        title: "Tournament Champion",
        description: "Participated in 20 or more tournaments",
        type: "participation" as const,
        earned_date: now,
        criteria_met: true,
        progress: 100,
        icon: "crown",
        rarity: "epic" as const,
      });
    }

    if (schoolStudents.length >= 10) {
      achievements.push({
        id: "growing_program",
        title: "Growing Program",
        description: "Built a debate program with 10+ active students",
        type: "milestone" as const,
        earned_date: now,
        criteria_met: true,
        progress: 100,
        icon: "users",
        rarity: "rare" as const,
      });
    }

    const availableBadges = [
      {
        id: "consistency_king",
        title: "Consistency King",
        description: "Maintain consistent performance across tournaments",
        criteria: "Average team performance variance < 20% across 5+ tournaments",
        progress: Math.min(100, totalTournaments * 20),
        max_progress: 100,
        locked: totalTournaments < 5,
      },
    ];

    const totalPoints = totalWins * 100 + totalDebates * 10 + totalTournaments * 50;
    const currentLevel = Math.floor(totalPoints / 1000) + 1;
    const pointsToNextLevel = ((currentLevel) * 1000) - totalPoints;

    const allSchools = await ctx.db.query("schools")
      .filter((q) => q.eq(q.field("country"), school.country))
      .collect();

    const schoolPerformances = await Promise.all(
      allSchools.map(async (sch) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_school_id", (q) => q.eq("school_id", sch._id))
          .collect();

        let schoolWins = 0;
        let schoolTotal = 0;

        teams.forEach(team => {
          const teamDebates = debates.filter(d =>
            (d.proposition_team_id === team._id || d.opposition_team_id === team._id) &&
            d.status === "completed"
          );

          teamDebates.forEach(debate => {
            schoolTotal++;
            if (debate.winning_team_id === team._id) {
              schoolWins++;
            }
          });
        });

        const winRate = schoolTotal > 0 ? schoolWins / schoolTotal : 0;
        return { school: sch, winRate, totalTeams: teams.length };
      })
    );

    const schoolWinRate = totalDebates > 0 ? totalWins / totalDebates : 0;
    const betterSchools = schoolPerformances.filter(sp => sp.winRate > schoolWinRate && sp.totalTeams > 0);
    const regionalRank = betterSchools.length + 1;

    return {
      achievements,
      available_badges: availableBadges,
      school_level: {
        current_level: currentLevel,
        experience_points: totalPoints,
        points_to_next_level: pointsToNextLevel,
        level_benefits: [
          "Access to advanced analytics",
          "Priority tournament registration",
          "Mentorship opportunities",
          "Exclusive training resources"
        ],
      },
      leaderboard_position: {
        regional_rank: regionalRank,
        national_rank: regionalRank,
        improvement_rank: regionalRank,
      },
    };
  },
});