import { query } from "../../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { Doc, Id } from "../../_generated/dataModel";

export const getStudentPerformanceAnalytics = query({
  args: {
    token: v.string(),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    compare_to_previous_period: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    personal_performance: {
      current_rank: number;
      best_rank: number;
      worst_rank: number;
      avg_speaker_score: number;
      total_tournaments: number;
      total_wins: number;
      total_losses: number;
      win_rate: number;
      consistency_score: number;
      points_earned: number;
    };
    performance_trends: Array<{
      tournament_name: string;
      date: number;
      speaker_rank: number;
      speaker_points: number;
      team_rank: number;
      avg_score: number;
      improvement_from_previous: number;
    }>;
    partner_analysis: Array<{
      partner_id: Id<"users">;
      partner_name: string;
      tournaments_together: number;
      win_rate_together: number;
      avg_speaker_score_together: number;
      chemistry_score: number;
      best_performance: {
        tournament_name: string;
        team_rank: number;
        combined_speaker_points: number;
      };
    }>;
    judge_feedback_analysis: {
      strengths: Array<{ area: string; frequency: number; improvement_rate: number }>;
      weaknesses: Array<{ area: string; frequency: number; priority: "high" | "medium" | "low" }>;
      feedback_trends: Array<{
        period: string;
        avg_score: number;
        feedback_count: number;
        improvement_notes: string[];
      }>;
      judge_preferences: Array<{
        judge_name: string;
        times_judged: number;
        avg_score_from_judge: number;
        feedback_sentiment: "positive" | "neutral" | "negative";
      }>;
    };
    tournament_analysis: {
      best_formats: Array<{ format: string; avg_rank: number; participation_count: number }>;
      motion_performance: Array<{
        motion_category: string;
        avg_score: number;
        win_rate: number;
        confidence_level: number;
      }>;
      regional_performance: Array<{
        region: string;
        tournaments: number;
        avg_rank: number;
        best_rank: number;
      }>;
      difficulty_analysis: {
        beginner_tournaments: { count: number; avg_rank: number; win_rate: number };
        intermediate_tournaments: { count: number; avg_rank: number; win_rate: number };
        advanced_tournaments: { count: number; avg_rank: number; win_rate: number };
      };
    };
    insights: Array<{
      type: "achievement" | "improvement" | "concern" | "opportunity";
      title: string;
      description: string;
      confidence: number;
      actionable_suggestions: string[];
      priority: "high" | "medium" | "low";
    }>;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const user = sessionResult.user;
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (365 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const teams = await ctx.db.query("teams").collect();
    const studentTeams = teams.filter(team => team.members.includes(user.id));

    const tournaments = await Promise.all(
      studentTeams.map(async (team) => {
        return await ctx.db.get(team.tournament_id);
      })
    );

    const validTournaments = tournaments.filter(Boolean).filter(t =>
      t!.start_date >= dateRange.start && t!.start_date <= dateRange.end
    ) as Doc<"tournaments">[];

    const relevantTeams = studentTeams.filter(team =>
      validTournaments.some(t => t._id === team.tournament_id)
    );

    const debates = await ctx.db.query("debates").collect();
    const judgingScores = await ctx.db.query("judging_scores").collect();

    const studentJudgingScores = judgingScores.filter(score =>
      score.speaker_scores?.some(s => s.speaker_id === user.id) &&
      debates.some(d => d._id === score.debate_id && validTournaments.some(t => t._id === d.tournament_id))
    );

    let totalSpeakerPoints = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalScore = 0;
    let scoreCount = 0;
    const ranks: number[] = [];

    studentJudgingScores.forEach(score => {
      const studentScore = score.speaker_scores?.find(s => s.speaker_id === user.id);
      if (studentScore) {
        totalSpeakerPoints += studentScore.total;
        totalScore += studentScore.total;
        scoreCount++;

        const approximateRank = Math.max(1, Math.ceil((1 - (studentScore.total / 30)) * 100));
        ranks.push(approximateRank);
      }
    });

    relevantTeams.forEach(team => {
      const teamDebates = debates.filter(d =>
        d.tournament_id === team.tournament_id &&
        (d.proposition_team_id === team._id || d.opposition_team_id === team._id) &&
        d.status === "completed"
      );

      teamDebates.forEach(debate => {
        if (debate.winning_team_id === team._id) {
          totalWins++;
        } else if (debate.winning_team_id) {
          totalLosses++;
        }
      });
    });

    const currentRank = ranks.length > 0 ? ranks[ranks.length - 1] : 999;
    const bestRank = ranks.length > 0 ? Math.min(...ranks) : 999;
    const worstRank = ranks.length > 0 ? Math.max(...ranks) : 1;
    const avgSpeakerScore = scoreCount > 0 ? totalScore / scoreCount : 0;
    const winRate = (totalWins + totalLosses) > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;

    const avgRank = ranks.length > 0 ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : 999;
    const variance = ranks.length > 0 ? ranks.reduce((sum, rank) => sum + Math.pow(rank - avgRank, 2), 0) / ranks.length : 0;
    const consistencyScore = Math.max(0, 100 - Math.sqrt(variance));

    const personalPerformance = {
      current_rank: currentRank,
      best_rank: bestRank,
      worst_rank: worstRank,
      avg_speaker_score: Math.round(avgSpeakerScore * 10) / 10,
      total_tournaments: validTournaments.length,
      total_wins: totalWins,
      total_losses: totalLosses,
      win_rate: Math.round(winRate * 10) / 10,
      consistency_score: Math.round(consistencyScore * 10) / 10,
      points_earned: totalSpeakerPoints,
    };

    const performanceTrends = await Promise.all(
      studentJudgingScores.map(async (score, index) => {
        const debate = debates.find(d => d._id === score.debate_id);
        const tournament = validTournaments.find(t => t._id === debate?.tournament_id);
        const studentScore = score.speaker_scores?.find(s => s.speaker_id === user.id);

        const teamResult = relevantTeams.find(team =>
          team.tournament_id === tournament?._id &&
          team.members.includes(user.id)
        );

        const teamDebates = teamResult ? debates.filter(d =>
          d.tournament_id === teamResult.tournament_id &&
          (d.proposition_team_id === teamResult._id || d.opposition_team_id === teamResult._id) &&
          d.status === "completed"
        ) : [];

        const teamWins = teamDebates.filter(d => d.winning_team_id === teamResult?._id).length;
        const teamTotal = teamDebates.length;
        const teamRank = teamTotal > 0 ? Math.max(1, Math.ceil((1 - (teamWins / teamTotal)) * 50)) : 999;

        const previousScore = index > 0 ? studentJudgingScores[index - 1].speaker_scores?.find(s => s.speaker_id === user.id) : null;
        const currentSpeakerRank = studentScore ? Math.max(1, Math.ceil((1 - (studentScore.total / 30)) * 100)) : 999;
        const previousSpeakerRank = previousScore ? Math.max(1, Math.ceil((1 - (previousScore.total / 30)) * 100)) : 999;

        const improvementFromPrevious = previousScore ? previousSpeakerRank - currentSpeakerRank : 0;

        return {
          tournament_name: tournament?.name || "Unknown",
          date: tournament?.start_date || Date.now(),
          speaker_rank: currentSpeakerRank,
          speaker_points: studentScore?.total || 0,
          team_rank: teamRank,
          avg_score: studentScore?.total || 0,
          improvement_from_previous: improvementFromPrevious,
        };
      })
    );

    performanceTrends.sort((a, b) => a.date - b.date);

    const partnerStats = new Map<Id<"users">, {
      name: string;
      tournaments: number;
      wins: number;
      losses: number;
      combinedSpeakerPoints: number[];
      bestPerformance: { tournament: string; teamRank: number; points: number };
    }>();

    for (const team of relevantTeams) {
      const partner = team.members.find(memberId => memberId !== user.id);
      if (!partner) continue;

      const partnerUser = await ctx.db.get(partner);
      if (!partnerUser) continue;

      const teamDebates = debates.filter(d =>
        d.tournament_id === team.tournament_id &&
        (d.proposition_team_id === team._id || d.opposition_team_id === team._id) &&
        d.status === "completed"
      );

      const tournament = validTournaments.find(t => t._id === team.tournament_id);

      const wins = teamDebates.filter(d => d.winning_team_id === team._id).length;
      const losses = teamDebates.filter(d => d.winning_team_id && d.winning_team_id !== team._id).length;

      const partnerJudgingScores = judgingScores.filter(score =>
        score.speaker_scores?.some(s => s.speaker_id === partner) &&
        teamDebates.some(d => d._id === score.debate_id)
      );

      const currentStats = partnerStats.get(partner) || {
        name: partnerUser.name,
        tournaments: 0,
        wins: 0,
        losses: 0,
        combinedSpeakerPoints: [],
        bestPerformance: { tournament: "", teamRank: 999, points: 0 },
      };

      currentStats.tournaments++;
      currentStats.wins += wins;
      currentStats.losses += losses;

      const studentPoints = studentJudgingScores
        .filter(score => teamDebates.some(d => d._id === score.debate_id))
        .reduce((sum, score) => {
          const speakerScore = score.speaker_scores?.find(s => s.speaker_id === user.id);
          return sum + (speakerScore?.total || 0);
        }, 0);

      const partnerPoints = partnerJudgingScores.reduce((sum, score) => {
        const speakerScore = score.speaker_scores?.find(s => s.speaker_id === partner);
        return sum + (speakerScore?.total || 0);
      }, 0);

      const combinedPoints = studentPoints + partnerPoints;
      currentStats.combinedSpeakerPoints.push(combinedPoints);

      const teamRank = teamDebates.length > 0 ? Math.max(1, Math.ceil((1 - (wins / teamDebates.length)) * 50)) : 999;
      if (teamRank < currentStats.bestPerformance.teamRank) {
        currentStats.bestPerformance = {
          tournament: tournament?.name || "Unknown",
          teamRank: teamRank,
          points: combinedPoints,
        };
      }

      partnerStats.set(partner, currentStats);
    }

    const partnerAnalysis = Array.from(partnerStats.entries()).map(([partnerId, stats]) => {
      const winRate = (stats.wins + stats.losses) > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0;
      const avgCombinedPoints = stats.combinedSpeakerPoints.length > 0
        ? stats.combinedSpeakerPoints.reduce((sum, points) => sum + points, 0) / stats.combinedSpeakerPoints.length
        : 0;

      const chemistryScore = Math.min(100,
        (winRate * 0.4) + (avgCombinedPoints * 0.003) + (stats.tournaments * 5));

      return {
        partner_id: partnerId,
        partner_name: stats.name,
        tournaments_together: stats.tournaments,
        win_rate_together: Math.round(winRate * 10) / 10,
        avg_speaker_score_together: Math.round(avgCombinedPoints * 10) / 10,
        chemistry_score: Math.round(chemistryScore * 10) / 10,
        best_performance: {
          tournament_name: stats.bestPerformance.tournament,
          team_rank: stats.bestPerformance.teamRank,
          combined_speaker_points: stats.bestPerformance.points,
        },
      };
    }).sort((a, b) => b.chemistry_score - a.chemistry_score);

    const judgeFeedback = await ctx.db.query("judge_feedback").collect();
    judgeFeedback.filter(feedback =>
      studentJudgingScores.some(score => score.judge_id === feedback.judge_id) &&
      debates.some(d => d._id === feedback.debate_id && validTournaments.some(t => t._id === d.tournament_id))
    );
    const strengthsMap = new Map<string, { frequency: number; scores: number[] }>();
    const weaknessesMap = new Map<string, { frequency: number; priority: number }>();
    const judgeStatsMap = new Map<Id<"users">, { name: string; scores: number[]; feedback: string[] }>();

    for (const score of studentJudgingScores) {
      const studentScore = score.speaker_scores?.find(s => s.speaker_id === user.id);
      if (!studentScore) continue;

      const judge = await ctx.db.get(score.judge_id);
      const judgeStats = judgeStatsMap.get(score.judge_id) || {
        name: judge?.name || "Unknown Judge",
        scores: [],
        feedback: [],
      };

      judgeStats.scores.push(studentScore.total);
      if (studentScore.comments) {
        judgeStats.feedback.push(studentScore.comments);
      }
      judgeStatsMap.set(score.judge_id, judgeStats);

      if (studentScore.comments) {
        const words = studentScore.comments.toLowerCase().split(/\s+/);

        const positiveWords = ['excellent', 'strong', 'good', 'clear', 'confident', 'logical', 'persuasive', 'articulate'];
        const negativeWords = ['weak', 'unclear', 'nervous', 'confused', 'poor', 'needs improvement', 'lacking'];

        positiveWords.forEach(word => {
          if (words.includes(word)) {
            const current = strengthsMap.get(word) || { frequency: 0, scores: [] };
            current.frequency++;
            current.scores.push(studentScore.total);
            strengthsMap.set(word, current);
          }
        });

        negativeWords.forEach(word => {
          if (words.includes(word)) {
            const current = weaknessesMap.get(word) || { frequency: 0, priority: 0 };
            current.frequency++;
            current.priority += studentScore.total < 20 ? 3 : studentScore.total < 25 ? 2 : 1;
            weaknessesMap.set(word, current);
          }
        });
      }
    }

    const strengths = Array.from(strengthsMap.entries())
      .map(([area, data]) => ({
        area,
        frequency: data.frequency,
        improvement_rate: data.scores.length > 1
          ? ((data.scores[data.scores.length - 1] - data.scores[0]) / data.scores[0]) * 100
          : 0,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    const weaknesses = Array.from(weaknessesMap.entries())
      .map(([area, data]) => ({
        area,
        frequency: data.frequency,
        priority: data.priority > 15 ? "high" as const : data.priority > 8 ? "medium" as const : "low" as const,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    const judgePreferences = await Promise.all(
      Array.from(judgeStatsMap.entries()).map(async ([judgeId, stats]) => {
        const judge = await ctx.db.get(judgeId);
        const avgScore = stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length;
        const sentiment = avgScore > 25 ? "positive" : avgScore > 20 ? "neutral" : "negative";

        return {
          judge_name: judge?.name || "Unknown Judge",
          times_judged: stats.scores.length,
          avg_score_from_judge: Math.round(avgScore * 10) / 10,
          feedback_sentiment: sentiment as "positive" | "neutral" | "negative",
        };
      })
    );

    const feedbackTrends = [];
    const months = Math.ceil((dateRange.end - dateRange.start) / (30 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < months; i++) {
      const periodStart = dateRange.start + (i * 30 * 24 * 60 * 60 * 1000);
      const periodEnd = Math.min(periodStart + (30 * 24 * 60 * 60 * 1000), dateRange.end);

      const periodScores = studentJudgingScores.filter(score => {
        const debate = debates.find(d => d._id === score.debate_id);
        const tournament = validTournaments.find(t => t._id === debate?.tournament_id);
        return tournament && tournament.start_date >= periodStart && tournament.start_date < periodEnd;
      });

      if (periodScores.length === 0) continue;

      const avgScore = periodScores.reduce((sum, score) => {
        const studentScore = score.speaker_scores?.find(s => s.speaker_id === user.id);
        return sum + (studentScore?.total || 0);
      }, 0) / periodScores.length;

      const improvementNotes = periodScores
        .map(score => score.speaker_scores?.find(s => s.speaker_id === user.id)?.comments)
        .filter(Boolean)
        .slice(0, 3) as string[];

      feedbackTrends.push({
        period: new Date(periodStart).toISOString().slice(0, 7),
        avg_score: Math.round(avgScore * 10) / 10,
        feedback_count: periodScores.length,
        improvement_notes: improvementNotes,
      });
    }

    const judgeAnalysis = {
      strengths,
      weaknesses,
      feedback_trends: feedbackTrends,
      judge_preferences: judgePreferences.sort((a, b) => b.avg_score_from_judge - a.avg_score_from_judge),
    };

    const formatPerformance = new Map<string, { ranks: number[]; tournaments: number }>();
    const regionPerformance = new Map<string, { tournaments: number; ranks: number[] }>();

    let beginnerCount = 0, intermediateCount = 0, advancedCount = 0;
    let beginnerRanks: number[] = [], intermediateRanks: number[] = [], advancedRanks: number[] = [];
    let beginnerWins = 0, intermediateWins = 0, advancedWins = 0;
    let beginnerTotal = 0, intermediateTotal = 0, advancedTotal = 0;

    validTournaments.forEach(tournament => {
      const tournamentTeam = relevantTeams.find(team => team.tournament_id === tournament._id);
      if (!tournamentTeam) return;

      const format = tournament.format;
      const formatStats = formatPerformance.get(format) || { ranks: [], tournaments: 0 };

      const tournamentDebates = debates.filter(d =>
        d.tournament_id === tournament._id &&
        (d.proposition_team_id === tournamentTeam._id || d.opposition_team_id === tournamentTeam._id) &&
        d.status === "completed"
      );

      const wins = tournamentDebates.filter(d => d.winning_team_id === tournamentTeam._id).length;
      const losses = tournamentDebates.filter(d => d.winning_team_id && d.winning_team_id !== tournamentTeam._id).length;
      const teamRank = tournamentDebates.length > 0 ? Math.max(1, Math.ceil((1 - (wins / tournamentDebates.length)) * 50)) : 999;

      formatStats.ranks.push(teamRank);
      formatStats.tournaments++;
      formatPerformance.set(format, formatStats);

      const location = tournament.location || "Unknown";
      const region = location.includes("Rwanda") ? "Rwanda" :
        location.includes("Uganda") ? "Uganda" :
          location.includes("Kenya") ? "Kenya" : "Other";

      const regionStats = regionPerformance.get(region) || { tournaments: 0, ranks: [] };
      regionStats.tournaments++;
      regionStats.ranks.push(teamRank);
      regionPerformance.set(region, regionStats);

      const difficulty = tournament.name.toLowerCase().includes("beginner") || tournament.name.toLowerCase().includes("novice") ? "beginner" :
        tournament.name.toLowerCase().includes("advanced") || tournament.name.toLowerCase().includes("open") ? "advanced" : "intermediate";

      if (difficulty === "beginner") {
        beginnerCount++;
        beginnerRanks.push(teamRank);
        beginnerWins += wins;
        beginnerTotal += wins + losses;
      } else if (difficulty === "advanced") {
        advancedCount++;
        advancedRanks.push(teamRank);
        advancedWins += wins;
        advancedTotal += wins + losses;
      } else {
        intermediateCount++;
        intermediateRanks.push(teamRank);
        intermediateWins += wins;
        intermediateTotal += wins + losses;
      }
    });

    const bestFormats = Array.from(formatPerformance.entries())
      .map(([format, stats]) => ({
        format,
        avg_rank: stats.ranks.length > 0 ? stats.ranks.reduce((sum, rank) => sum + rank, 0) / stats.ranks.length : 999,
        participation_count: stats.tournaments,
      }))
      .sort((a, b) => a.avg_rank - b.avg_rank);

    const motionAnalysis = Array.from(formatPerformance.entries())
      .map(([format, stats]) => {
        const avgScore = avgSpeakerScore;
        const winRate = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;

        return {
          motion_category: format,
          avg_score: avgScore,
          win_rate: winRate,
          confidence_level: Math.min(100, stats.tournaments * 20),
        };
      });

    const regionalAnalysis = Array.from(regionPerformance.entries())
      .map(([region, stats]) => ({
        region,
        tournaments: stats.tournaments,
        avg_rank: stats.ranks.length > 0 ? stats.ranks.reduce((sum, rank) => sum + rank, 0) / stats.ranks.length : 999,
        best_rank: stats.ranks.length > 0 ? Math.min(...stats.ranks) : 999,
      }));

    const difficultyAnalysis = {
      beginner_tournaments: {
        count: beginnerCount,
        avg_rank: beginnerRanks.length > 0 ? beginnerRanks.reduce((sum, rank) => sum + rank, 0) / beginnerRanks.length : 999,
        win_rate: beginnerTotal > 0 ? (beginnerWins / beginnerTotal) * 100 : 0,
      },
      intermediate_tournaments: {
        count: intermediateCount,
        avg_rank: intermediateRanks.length > 0 ? intermediateRanks.reduce((sum, rank) => sum + rank, 0) / intermediateRanks.length : 999,
        win_rate: intermediateTotal > 0 ? (intermediateWins / intermediateTotal) * 100 : 0,
      },
      advanced_tournaments: {
        count: advancedCount,
        avg_rank: advancedRanks.length > 0 ? advancedRanks.reduce((sum, rank) => sum + rank, 0) / advancedRanks.length : 999,
        win_rate: advancedTotal > 0 ? (advancedWins / advancedTotal) * 100 : 0,
      },
    };

    const tournamentAnalysis = {
      best_formats: bestFormats,
      motion_performance: motionAnalysis,
      regional_performance: regionalAnalysis,
      difficulty_analysis: difficultyAnalysis,
    };

    const insights = [];

    if (personalPerformance.best_rank <= 10) {
      insights.push({
        type: "achievement" as const,
        title: "Top 10 Performance Achieved",
        description: `You achieved rank #${personalPerformance.best_rank}, placing you among the top speakers`,
        confidence: 95,
        actionable_suggestions: [
          "Aim for consistency at this level",
          "Consider mentoring newer debaters",
          "Set sights on breaking at major tournaments",
        ],
        priority: "high" as const,
      });
    }

    if (performanceTrends.length >= 3) {
      const recentTrends = performanceTrends.slice(-3);
      const isImproving = recentTrends.every((trend, i) =>
        i === 0 || trend.speaker_rank <= recentTrends[i-1].speaker_rank
      );

      if (isImproving) {
        insights.push({
          type: "improvement" as const,
          title: "Consistent Improvement Trend",
          description: "Your rankings have been steadily improving over recent tournaments",
          confidence: 85,
          actionable_suggestions: [
            "Continue current preparation methods",
            "Document what's working well",
            "Gradually increase tournament difficulty",
          ],
          priority: "medium" as const,
        });
      }
    }

    if (personalPerformance.consistency_score < 50) {
      insights.push({
        type: "concern" as const,
        title: "Inconsistent Performance",
        description: "Your rankings vary significantly between tournaments",
        confidence: 80,
        actionable_suggestions: [
          "Develop a consistent preparation routine",
          "Focus on adaptability across different motion types",
          "Work with a coach on mental preparation",
        ],
        priority: "high" as const,
      });
    }

    if (partnerAnalysis.length > 0) {
      const bestPartner = partnerAnalysis[0];
      if (bestPartner.chemistry_score > 80) {
        insights.push({
          type: "opportunity" as const,
          title: "Strong Partnership Identified",
          description: `You have excellent chemistry with ${bestPartner.partner_name}`,
          confidence: 90,
          actionable_suggestions: [
            "Consider forming a regular partnership",
            "Develop specialized strategies together",
            "Enter major tournaments as a team",
          ],
          priority: "medium" as const,
        });
      }
    }

    if (bestFormats.length > 0 && bestFormats[0].avg_rank < personalPerformance.current_rank * 0.8) {
      insights.push({
        type: "opportunity" as const,
        title: `Strong ${bestFormats[0].format} Performance`,
        description: `You perform significantly better in ${bestFormats[0].format} format`,
        confidence: 75,
        actionable_suggestions: [
          `Focus on ${bestFormats[0].format} tournaments`,
          `Study the specific skills needed for ${bestFormats[0].format}`,
          "Apply successful strategies to other formats",
        ],
        priority: "medium" as const,
      });
    }

    if (personalPerformance.total_tournaments < 5) {
      insights.push({
        type: "opportunity" as const,
        title: "Gain More Tournament Experience",
        description: "Participating in more tournaments will help improve your skills and rankings",
        confidence: 85,
        actionable_suggestions: [
          "Aim to participate in at least one tournament per month",
          "Start with tournaments matching your current skill level",
          "Focus on learning rather than just winning",
        ],
        priority: "high" as const,
      });
    }

    return {
      personal_performance: personalPerformance,
      performance_trends: performanceTrends,
      partner_analysis: partnerAnalysis,
      judge_feedback_analysis: judgeAnalysis,
      tournament_analysis: tournamentAnalysis,
      insights: insights,
    };
  },
});

export const exportStudentAnalyticsData = query({
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

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "student") {
      throw new Error("Student access required");
    }

    const exportData: Record<string, any> = {};

    if (args.sections.includes("performance")) {
      const performanceData = await ctx.runQuery(api.functions.student.analytics.getStudentPerformanceAnalytics, {
        token: args.token,
        date_range: args.date_range,
      });

      exportData.performance_summary = {
        current_rank: performanceData.personal_performance.current_rank,
        best_rank: performanceData.personal_performance.best_rank,
        avg_speaker_score: performanceData.personal_performance.avg_speaker_score,
        total_tournaments: performanceData.personal_performance.total_tournaments,
        win_rate: performanceData.personal_performance.win_rate,
        consistency_score: performanceData.personal_performance.consistency_score,
      };

      exportData.performance_trends = performanceData.performance_trends.map(trend => ({
        tournament_name: trend.tournament_name,
        date: new Date(trend.date).toLocaleDateString(),
        speaker_rank: trend.speaker_rank,
        speaker_points: trend.speaker_points,
        team_rank: trend.team_rank,
        avg_score: trend.avg_score,
      }));

      exportData.partner_analysis = performanceData.partner_analysis.map(partner => ({
        partner_name: partner.partner_name,
        tournaments_together: partner.tournaments_together,
        win_rate_together: partner.win_rate_together,
        chemistry_score: partner.chemistry_score,
      }));

      exportData.tournament_analysis = performanceData.tournament_analysis.best_formats.map(format => ({
        format: format.format,
        avg_rank: format.avg_rank,
        participation_count: format.participation_count,
      }));
    }

    return exportData;
  },
});