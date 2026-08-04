import { query } from "../../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { Doc, Id } from "../../_generated/dataModel";

export const getVolunteerJudgingAnalytics = query({
  args: {
    token: v.string(),
    date_range: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    compare_to_previous_period: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    judging_performance: {
      total_debates_judged: number;
      total_tournaments: number;
      avg_judging_quality: number;
      consistency_score: number;
      response_time_avg: number;
      feedback_quality_score: number;
      bias_detection_incidents: number;
      experience_level: "novice" | "intermediate" | "experienced" | "expert";
    };
    judging_trends: Array<{
      period: string;
      debates_judged: number;
      avg_quality_rating: number;
      avg_response_time: number;
      tournaments_participated: number;
      feedback_provided: number;
    }>;
    feedback_analysis: {
      feedback_given: Array<{
        tournament_name: string;
        debate_count: number;
        avg_feedback_length: number;
        constructive_rating: number;
        helpfulness_score: number;
      }>;
      feedback_received: Array<{
        rating_category: string;
        avg_score: number;
        feedback_count: number;
        improvement_trend: number;
      }>;
      common_feedback_themes: Array<{
        theme: string;
        frequency: number;
        sentiment: "positive" | "neutral" | "negative";
      }>;
    };
    tournament_contributions: Array<{
      tournament_id: Id<"tournaments">;
      tournament_name: string;
      role: "judge" | "chief_judge" | "tabulator" | "organizer";
      debates_judged: number;
      contribution_score: number;
      organizer_rating: number;
      student_feedback_avg: number;
      impact_metrics: {
        debates_facilitated: number;
        students_evaluated: number;
        feedback_provided: number;
        time_contributed: number;
      };
    }>;
    format_expertise: Array<{
      format: string;
      debates_judged: number;
      proficiency_level: number;
      specialization_score: number;
      recent_performance: number;
    }>;
    comparative_analysis: {
      peer_ranking: number;
      experience_percentile: number;
      quality_percentile: number;
      activity_percentile: number;
      peer_comparison: Array<{
        metric: string;
        your_value: number;
        peer_average: number;
        percentile: number;
      }>;
      improvement_areas: Array<{
        area: string;
        current_score: number;
        target_score: number;
        improvement_suggestions: string[];
      }>;
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

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const user = sessionResult.user;
    const now = Date.now();
    const dateRange = args.date_range || {
      start: now - (365 * 24 * 60 * 60 * 1000),
      end: now,
    };

    const judgingScores = await ctx.db
      .query("judging_scores")
      .withIndex("by_judge_id", (q) => q.eq("judge_id", user.id))
      .collect();

    const relevantJudgingScores = judgingScores.filter(
      (score): score is typeof score & { submitted_at: number } =>
        score.submission_state === "submitted" &&
        score.submitted_at !== undefined &&
        score.submitted_at >= dateRange.start &&
        score.submitted_at <= dateRange.end
    );

    const judgeFeedback = await ctx.db.query("judge_feedback").collect();
    const receivedFeedback = judgeFeedback.filter(feedback =>
      feedback.judge_id === user.id &&
      feedback.submitted_at >= dateRange.start &&
      feedback.submitted_at <= dateRange.end
    );

    const debates = await ctx.db.query("debates").collect();
    const judgedDebates = debates.filter(debate =>
      relevantJudgingScores.some(score => score.debate_id === debate._id)
    );

    const tournaments = await Promise.all(
      judgedDebates.map(async (debate) => {
        return await ctx.db.get(debate.tournament_id);
      })
    );

    const validTournaments = tournaments.filter(Boolean) as Doc<"tournaments">[];
    const uniqueTournaments = Array.from(new Set(validTournaments.map(t => t._id)))
      .map(id => validTournaments.find(t => t._id === id)!)
      .filter(Boolean);

    let totalQualityRating = 0;
    let qualityRatingCount = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let biasIncidents = 0;
    let totalFeedbackLength = 0;
    let feedbackCount = 0;

    relevantJudgingScores.forEach(score => {
      const debate = judgedDebates.find(d => d._id === score.debate_id);
      if (debate && debate.start_time) {
        const responseTime = (score.submitted_at - debate.start_time) / (60 * 60 * 1000);
        if (responseTime > 0 && responseTime < 72) {
          totalResponseTime += responseTime;
          responseTimeCount++;
        }
      }

      if (score.speaker_scores) {
        score.speaker_scores.forEach(speakerScore => {
          if (speakerScore.bias_detected) {
            biasIncidents++;
          }
          if (speakerScore.comments) {
            totalFeedbackLength += speakerScore.comments.length;
            feedbackCount++;
          }
        });
      }
    });

    receivedFeedback.forEach(feedback => {
      const avgRating = (feedback.clarity + feedback.fairness + feedback.knowledge + feedback.helpfulness) / 4;
      totalQualityRating += avgRating;
      qualityRatingCount++;
    });

    const avgJudgingQuality = qualityRatingCount > 0 ? totalQualityRating / qualityRatingCount : 0;
    const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
    const avgFeedbackLength = feedbackCount > 0 ? totalFeedbackLength / feedbackCount : 0;

    const judgingScoreVariances: number[] = [];
    relevantJudgingScores.forEach(score => {
      if (score.speaker_scores && score.speaker_scores.length > 1) {
        const scores = score.speaker_scores.map(s => s.total);
        const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
        judgingScoreVariances.push(Math.sqrt(variance));
      }
    });

    const consistencyScore = judgingScoreVariances.length > 0
      ? Math.max(0, 100 - (judgingScoreVariances.reduce((sum, v) => sum + v, 0) / judgingScoreVariances.length) * 10)
      : 100;

    const feedbackQualityScore = Math.min(100, (avgFeedbackLength / 50) * avgJudgingQuality * 10);

    const experienceLevel = relevantJudgingScores.length < 10 ? "novice" :
      relevantJudgingScores.length < 50 ? "intermediate" :
        relevantJudgingScores.length < 150 ? "experienced" : "expert";

    const judgingPerformance = {
      total_debates_judged: relevantJudgingScores.length,
      total_tournaments: uniqueTournaments.length,
      avg_judging_quality: Math.round(avgJudgingQuality * 10) / 10,
      consistency_score: Math.round(consistencyScore * 10) / 10,
      response_time_avg: Math.round(avgResponseTime * 10) / 10,
      feedback_quality_score: Math.round(feedbackQualityScore * 10) / 10,
      bias_detection_incidents: biasIncidents,
      experience_level: experienceLevel as "novice" | "intermediate" | "experienced" | "expert",
    };

    const judgingTrends = [];
    const months = Math.ceil((dateRange.end - dateRange.start) / (30 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < months; i++) {
      const periodStart = dateRange.start + (i * 30 * 24 * 60 * 60 * 1000);
      const periodEnd = Math.min(periodStart + (30 * 24 * 60 * 60 * 1000), dateRange.end);

      const periodScores = relevantJudgingScores.filter(score =>
        score.submitted_at >= periodStart && score.submitted_at < periodEnd
      );

      const periodFeedback = receivedFeedback.filter(feedback =>
        feedback.submitted_at >= periodStart && feedback.submitted_at < periodEnd
      );

      const periodTournaments = uniqueTournaments.filter(tournament => {
        const tournamentScores = periodScores.filter(score => {
          const debate = judgedDebates.find(d => d._id === score.debate_id);
          return debate && debate.tournament_id === tournament._id;
        });
        return tournamentScores.length > 0;
      });

      const avgQualityRating = periodFeedback.length > 0
        ? periodFeedback.reduce((sum, f) => sum + (f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4, 0) / periodFeedback.length
        : 0;

      let periodResponseTime = 0;
      let periodResponseCount = 0;

      periodScores.forEach(score => {
        const debate = judgedDebates.find(d => d._id === score.debate_id);
        if (debate && debate.start_time) {
          const responseTime = (score.submitted_at - debate.start_time) / (60 * 60 * 1000);
          if (responseTime > 0 && responseTime < 72) {
            periodResponseTime += responseTime;
            periodResponseCount++;
          }
        }
      });

      const avgPeriodResponseTime = periodResponseCount > 0 ? periodResponseTime / periodResponseCount : 0;

      let feedbackProvided = 0;
      periodScores.forEach(score => {
        if (score.speaker_scores) {
          feedbackProvided += score.speaker_scores.filter(s => s.comments && s.comments.length > 10).length;
        }
      });

      judgingTrends.push({
        period: new Date(periodStart).toISOString().slice(0, 7),
        debates_judged: periodScores.length,
        avg_quality_rating: Math.round(avgQualityRating * 10) / 10,
        avg_response_time: Math.round(avgPeriodResponseTime * 10) / 10,
        tournaments_participated: periodTournaments.length,
        feedback_provided: feedbackProvided,
      });
    }

    const feedbackGiven = await Promise.all(
      uniqueTournaments.map(async (tournament) => {
        const tournamentScores = relevantJudgingScores.filter(score => {
          const debate = judgedDebates.find(d => d._id === score.debate_id);
          return debate && debate.tournament_id === tournament._id;
        });

        let totalFeedbackLength = 0;
        let feedbackCount = 0;
        let constructiveElements = 0;

        tournamentScores.forEach(score => {
          if (score.speaker_scores) {
            score.speaker_scores.forEach(speakerScore => {
              if (speakerScore.comments) {
                totalFeedbackLength += speakerScore.comments.length;
                feedbackCount++;

                const constructiveWords = ['improve', 'consider', 'try', 'develop', 'practice', 'focus'];
                const hasConstructive = constructiveWords.some(word =>
                  speakerScore.comments!.toLowerCase().includes(word)
                );
                if (hasConstructive) constructiveElements++;
              }
            });
          }
        });

        const avgFeedbackLength = feedbackCount > 0 ? totalFeedbackLength / feedbackCount : 0;
        const constructiveRating = feedbackCount > 0 ? (constructiveElements / feedbackCount) * 100 : 0;
        const helpfulnessScore = Math.min(100, (avgFeedbackLength / 100) * constructiveRating);

        return {
          tournament_name: tournament.name,
          debate_count: tournamentScores.length,
          avg_feedback_length: Math.round(avgFeedbackLength),
          constructive_rating: Math.round(constructiveRating),
          helpfulness_score: Math.round(helpfulnessScore),
        };
      })
    );

    const feedbackReceivedCategories = [
      { category: "clarity", scores: receivedFeedback.map(f => f.clarity) },
      { category: "fairness", scores: receivedFeedback.map(f => f.fairness) },
      { category: "knowledge", scores: receivedFeedback.map(f => f.knowledge) },
      { category: "helpfulness", scores: receivedFeedback.map(f => f.helpfulness) },
    ];

    const feedbackReceived = feedbackReceivedCategories.map(cat => {
      const avgScore = cat.scores.length > 0
        ? cat.scores.reduce((sum, score) => sum + score, 0) / cat.scores.length
        : 0;

      const recentScores = cat.scores.slice(-5);
      const olderScores = cat.scores.slice(0, -5);
      const improvementTrend = recentScores.length > 0 && olderScores.length > 0
        ? ((recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length) -
          (olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length)) /
        (olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length) * 100
        : 0;

      return {
        rating_category: cat.category,
        avg_score: Math.round(avgScore * 10) / 10,
        feedback_count: cat.scores.length,
        improvement_trend: Math.round(improvementTrend * 10) / 10,
      };
    });

    const commonThemes = new Map<string, { count: number; sentiment: "positive" | "neutral" | "negative" }>();

    receivedFeedback.forEach(feedback => {
      if (feedback.comments) {
        const words = feedback.comments.toLowerCase().split(/\s+/);
        const positiveWords = ['excellent', 'great', 'good', 'fair', 'consistent', 'thorough'];
        const negativeWords = ['bias', 'unfair', 'inconsistent', 'unclear', 'rushed'];

        words.forEach(word => {
          if (positiveWords.includes(word)) {
            const current = commonThemes.get(word) || { count: 0, sentiment: "positive" as const };
            current.count++;
            commonThemes.set(word, current);
          } else if (negativeWords.includes(word)) {
            const current = commonThemes.get(word) || { count: 0, sentiment: "negative" as const };
            current.count++;
            commonThemes.set(word, current);
          }
        });
      }
    });

    const commonFeedbackThemes = Array.from(commonThemes.entries())
      .map(([theme, data]) => ({
        theme,
        frequency: data.count,
        sentiment: data.sentiment,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const feedbackAnalysis = {
      feedback_given: feedbackGiven.sort((a, b) => b.helpfulness_score - a.helpfulness_score),
      feedback_received: feedbackReceived,
      common_feedback_themes: commonFeedbackThemes,
    };

    const tournamentContributions = await Promise.all(
      uniqueTournaments.map(async (tournament) => {
        const tournamentScores = relevantJudgingScores.filter(score => {
          const debate = judgedDebates.find(d => d._id === score.debate_id);
          return debate && debate.tournament_id === tournament._id;
        });

        const tournamentFeedback = receivedFeedback.filter(feedback => {
          const score = relevantJudgingScores.find(s => s.judge_id === feedback.judge_id);
          if (!score) return false;
          const debate = judgedDebates.find(d => d._id === score.debate_id);
          return debate && debate.tournament_id === tournament._id;
        });

        const organizerRating = tournamentFeedback.length > 0
          ? tournamentFeedback.reduce((sum, f) => sum + (f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4, 0) / tournamentFeedback.length
          : 0;

        const studentFeedbackAvg = organizerRating;

        let studentsEvaluated = 0;
        let feedbackProvided = 0;
        let timeContributed = 0;

        tournamentScores.forEach(score => {
          if (score.speaker_scores) {
            studentsEvaluated += score.speaker_scores.length;
            feedbackProvided += score.speaker_scores.filter(s => s.comments && s.comments.length > 10).length;
          }

          const debate = judgedDebates.find(d => d._id === score.debate_id);
          if (debate && debate.start_time && debate.end_time) {
            timeContributed += (debate.end_time - debate.start_time) / (60 * 60 * 1000);
          }
        });

        const contributionScore = Math.min(100,
          (tournamentScores.length * 10) +
          (feedbackProvided * 5) +
          (organizerRating * 5) +
          (timeContributed * 2)
        );

        const isChiefJudge = tournamentScores.length > 10;
        const role = isChiefJudge ? "chief_judge" : "judge";

        return {
          tournament_id: tournament._id,
          tournament_name: tournament.name,
          role: role as "judge" | "chief_judge" | "tabulator" | "organizer",
          debates_judged: tournamentScores.length,
          contribution_score: Math.round(contributionScore),
          organizer_rating: Math.round(organizerRating * 10) / 10,
          student_feedback_avg: Math.round(studentFeedbackAvg * 10) / 10,
          impact_metrics: {
            debates_facilitated: tournamentScores.length,
            students_evaluated: studentsEvaluated,
            feedback_provided: feedbackProvided,
            time_contributed: Math.round(timeContributed * 10) / 10,
          },
        };
      })
    );

    const formatExpertise = new Map<string, { debates: number; scores: number[]; recent: number[] }>();

    uniqueTournaments.forEach(tournament => {
      const tournamentScores = relevantJudgingScores.filter(score => {
        const debate = judgedDebates.find(d => d._id === score.debate_id);
        return debate && debate.tournament_id === tournament._id;
      });

      const tournamentFeedback = receivedFeedback.filter(feedback => {
        const score = relevantJudgingScores.find(s => s.judge_id === feedback.judge_id);
        if (!score) return false;
        const debate = judgedDebates.find(d => d._id === score.debate_id);
        return debate && debate.tournament_id === tournament._id;
      });

      const current = formatExpertise.get(tournament.format) || { debates: 0, scores: [], recent: [] };
      current.debates += tournamentScores.length;

      tournamentFeedback.forEach(feedback => {
        const avgScore = (feedback.clarity + feedback.fairness + feedback.knowledge + feedback.helpfulness) / 4;
        current.scores.push(avgScore);

        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        if (feedback.submitted_at >= thirtyDaysAgo) {
          current.recent.push(avgScore);
        }
      });

      formatExpertise.set(tournament.format, current);
    });

    const formatExpertiseArray = Array.from(formatExpertise.entries()).map(([format, data]) => {
      const proficiencyLevel = Math.min(100, (data.debates * 2) + (data.scores.length * 5));
      const avgScore = data.scores.length > 0
        ? data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length
        : 0;
      const specializationScore = Math.min(100, proficiencyLevel * (avgScore / 5));
      const recentPerformance = data.recent.length > 0
        ? data.recent.reduce((sum, score) => sum + score, 0) / data.recent.length
        : avgScore;

      return {
        format,
        debates_judged: data.debates,
        proficiency_level: Math.round(proficiencyLevel),
        specialization_score: Math.round(specializationScore),
        recent_performance: Math.round(recentPerformance * 10) / 10,
      };
    }).sort((a, b) => b.specialization_score - a.specialization_score);

    const allVolunteers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "volunteer"))
      .collect();

    const volunteerMetrics = await Promise.all(
      allVolunteers.map(async (volunteer) => {
        const volunteerScores = await ctx.db
          .query("judging_scores")
          .withIndex("by_judge_id", (q) => q.eq("judge_id", volunteer._id))
          .collect();

        const volunteerFeedback = judgeFeedback.filter(f => f.judge_id === volunteer._id);
        const volunteerQuality = volunteerFeedback.length > 0
          ? volunteerFeedback.reduce((sum, f) => sum + (f.clarity + f.fairness + f.knowledge + f.helpfulness) / 4, 0) / volunteerFeedback.length
          : 0;

        return {
          volunteer_id: volunteer._id,
          name: volunteer.name,
          debates_judged: volunteerScores.length,
          quality: volunteerQuality,
          created_at: volunteer.created_at,
        };
      })
    );

    const activeVolunteers = volunteerMetrics.filter(v => v.debates_judged > 0);

    const betterThanUser = activeVolunteers.filter(v => v.quality > avgJudgingQuality).length;
    const moreActive = activeVolunteers.filter(v => v.debates_judged > judgingPerformance.total_debates_judged).length;

    const experiencePercentile = activeVolunteers.length > 0
      ? ((activeVolunteers.length - moreActive) / activeVolunteers.length) * 100
      : 50;

    const qualityPercentile = activeVolunteers.length > 0
      ? ((activeVolunteers.length - betterThanUser) / activeVolunteers.length) * 100
      : 50;

    const activityPercentile = experiencePercentile;

    const peerAverages = {
      debates_judged: activeVolunteers.length > 0
        ? activeVolunteers.reduce((sum, vp) => sum + vp.debates_judged, 0) / activeVolunteers.length
        : 0,
      avg_quality: activeVolunteers.length > 0
        ? activeVolunteers.reduce((sum, vp) => sum + vp.quality, 0) / activeVolunteers.length
        : 0,
      consistency: 75,
      response_time: 12,
    };

    const peerComparison = [
      {
        metric: "Debates Judged",
        your_value: judgingPerformance.total_debates_judged,
        peer_average: Math.round(peerAverages.debates_judged),
        percentile: Math.round(experiencePercentile),
      },
      {
        metric: "Quality Rating",
        your_value: Math.round(avgJudgingQuality * 10) / 10,
        peer_average: Math.round(peerAverages.avg_quality * 10) / 10,
        percentile: Math.round(qualityPercentile),
      },
      {
        metric: "Consistency Score",
        your_value: Math.round(consistencyScore),
        peer_average: Math.round(peerAverages.consistency),
        percentile: consistencyScore > peerAverages.consistency ? 75 : 25,
      },
      {
        metric: "Response Time (hours)",
        your_value: Math.round(avgResponseTime * 10) / 10,
        peer_average: Math.round(peerAverages.response_time * 10) / 10,
        percentile: avgResponseTime < peerAverages.response_time ? 75 : 25,
      },
    ];

    const improvementAreas = [];

    if (avgJudgingQuality < 4.0) {
      improvementAreas.push({
        area: "Judging Quality",
        current_score: Math.round(avgJudgingQuality * 20),
        target_score: 80,
        improvement_suggestions: [
          "Focus on providing more detailed feedback",
          "Attend judging workshops and training sessions",
          "Study exemplary judging practices",
          "Seek mentorship from experienced judges",
        ],
      });
    }

    if (consistencyScore < 80) {
      improvementAreas.push({
        area: "Consistency",
        current_score: Math.round(consistencyScore),
        target_score: 85,
        improvement_suggestions: [
          "Develop standardized evaluation criteria",
          "Take notes during debates to maintain focus",
          "Practice scoring calibration exercises",
          "Review scoring patterns regularly",
        ],
      });
    }

    if (avgResponseTime > 8) {
      improvementAreas.push({
        area: "Response Time",
        current_score: Math.max(0, 100 - (avgResponseTime * 5)),
        target_score: 80,
        improvement_suggestions: [
          "Allocate dedicated time for balloting",
          "Use template formats for efficient feedback",
          "Complete ballots immediately after debates",
          "Set personal deadlines for submission",
        ],
      });
    }

    if (feedbackQualityScore < 60) {
      improvementAreas.push({
        area: "Feedback Quality",
        current_score: Math.round(feedbackQualityScore),
        target_score: 75,
        improvement_suggestions: [
          "Provide specific examples in feedback",
          "Include both strengths and areas for improvement",
          "Use constructive language and tone",
          "Tailor feedback to student experience level",
        ],
      });
    }

    const comparativeAnalysis = {
      peer_ranking: betterThanUser + moreActive + 1,
      experience_percentile: Math.round(experiencePercentile),
      quality_percentile: Math.round(qualityPercentile),
      activity_percentile: Math.round(activityPercentile),
      peer_comparison: peerComparison,
      improvement_areas: improvementAreas,
    };

    const insights = [];

    if (avgJudgingQuality >= 4.5) {
      insights.push({
        type: "achievement" as const,
        title: "Exceptional Judging Quality",
        description: `Your average rating of ${avgJudgingQuality.toFixed(1)}/5 places you among the top judges`,
        confidence: 95,
        actionable_suggestions: [
          "Continue maintaining high standards",
          "Share your expertise with newer judges",
          "Apply for chief judge positions",
        ],
        priority: "high" as const,
      });
    }

    if (consistencyScore >= 90) {
      insights.push({
        type: "achievement" as const,
        title: "Outstanding Consistency",
        description: `Your consistency score of ${consistencyScore.toFixed(1)}% demonstrates excellent standardization`,
        confidence: 90,
        actionable_suggestions: [
          "Continue current evaluation methods",
          "Document your judging criteria for training purposes",
          "Lead consistency workshops",
        ],
        priority: "medium" as const,
      });
    }

    if (relevantJudgingScores.length >= 50) {
      insights.push({
        type: "achievement" as const,
        title: "Dedicated Community Contributor",
        description: `You've judged ${relevantJudgingScores.length} debates, making significant community impact`,
        confidence: 100,
        actionable_suggestions: [
          "Apply for recognition awards",
          "Take on leadership roles in tournaments",
          "Consider organizing your own tournaments",
        ],
        priority: "medium" as const,
      });
    }

    if (biasIncidents > 5) {
      insights.push({
        type: "concern" as const,
        title: "Bias Detection Alerts",
        description: `${biasIncidents} bias incidents detected - consider reviewing judging approach`,
        confidence: 80,
        actionable_suggestions: [
          "Attend bias awareness training",
          "Review flagged decisions with mentors",
          "Implement systematic evaluation checklists",
          "Practice with diverse debate styles",
        ],
        priority: "high" as const,
      });
    }

    if (avgResponseTime > 12) {
      insights.push({
        type: "concern" as const,
        title: "Slow Response Times",
        description: `Average response time of ${avgResponseTime.toFixed(1)} hours may impact tournament flow`,
        confidence: 85,
        actionable_suggestions: [
          "Set personal deadlines for ballot submission",
          "Use mobile apps for quick balloting",
          "Allocate specific time slots for judging tasks",
          "Consider time management techniques",
        ],
        priority: "medium" as const,
      });
    }

    if (formatExpertiseArray.length >= 2) {
      insights.push({
        type: "opportunity" as const,
        title: "Multi-Format Experience",
        description: `You have experience in ${formatExpertiseArray.length} formats`,
        confidence: 75,
        actionable_suggestions: [
          "Consider specializing in your strongest format",
          "Develop expertise across multiple formats",
          "Apply specialized knowledge to help others",
        ],
        priority: "low" as const,
      });
    }

    const recentTrend = judgingTrends.slice(-3);
    if (recentTrend.length >= 2) {
      const isImproving = recentTrend.every((trend, i) =>
        i === 0 || trend.avg_quality_rating >= recentTrend[i-1].avg_quality_rating
      );

      if (isImproving) {
        insights.push({
          type: "improvement" as const,
          title: "Quality Improvement Trend",
          description: "Your judging quality has been consistently improving",
          confidence: 85,
          actionable_suggestions: [
            "Continue current development practices",
            "Document what's working well",
            "Share improvement strategies with peers",
          ],
          priority: "low" as const,
        });
      }
    }

    if (feedbackQualityScore < 40) {
      insights.push({
        type: "opportunity" as const,
        title: "Enhance Feedback Quality",
        description: "Improving feedback quality will increase your impact on student development",
        confidence: 75,
        actionable_suggestions: [
          "Study examples of excellent judge feedback",
          "Practice writing detailed, constructive comments",
          "Ask students what feedback they find most helpful",
          "Attend feedback writing workshops",
        ],
        priority: "medium" as const,
      });
    }

    return {
      judging_performance: judgingPerformance,
      judging_trends: judgingTrends.sort((a, b) => a.period.localeCompare(b.period)),
      feedback_analysis: feedbackAnalysis,
      tournament_contributions: tournamentContributions.sort((a, b) => b.contribution_score - a.contribution_score),
      format_expertise: formatExpertiseArray,
      comparative_analysis: comparativeAnalysis,
      insights: insights,
    };
  },
});

export const exportVolunteerAnalyticsData = query({
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

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "volunteer") {
      throw new Error("Volunteer access required");
    }

    const exportData: Record<string, any> = {};

    if (args.sections.includes("judging")) {
      const judgingData = await ctx.runQuery(api.functions.volunteers.analytics.getVolunteerJudgingAnalytics, {
        token: args.token,
        date_range: args.date_range,
      });

      exportData.judging_summary = judgingData.judging_performance;
      exportData.judging_trends = judgingData.judging_trends;
      exportData.tournament_contributions = judgingData.tournament_contributions.map((tc: { tournament_name: any; role: any; debates_judged: any; contribution_score: any; organizer_rating: any; }) => ({
        tournament_name: tc.tournament_name,
        role: tc.role,
        debates_judged: tc.debates_judged,
        contribution_score: tc.contribution_score,
        organizer_rating: tc.organizer_rating,
      }));
      exportData.format_expertise = judgingData.format_expertise;
    }

    return exportData;
  },
});