import { mutation, query } from "../_generated/server";
import { GenericId, v } from "convex/values";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";

interface RankingResponse<T> {
  success: boolean;
  error: string | null;
  data: T;
  type: "success" | "permission_error" | "validation_error" | "data_insufficient" | "not_released";
}

interface TeamRanking {
  rank: number;
  team_id: Id<"teams">;
  team_name: string;
  school_id?: Id<"schools">;
  school_name?: string;
  school_type?: string;
  total_wins: number;
  total_losses: number;
  total_points: number;
  opponents_total_wins: number;
  opponents_total_points: number;
  head_to_head_wins: number;
  eliminated_in_round?: number;
}

interface SchoolRanking {
  rank: number;
  school_id: Id<"schools">;
  school_name: string;
  school_type: string;
  total_teams: number;
  total_wins: number;
  total_points: number;
  best_team_rank: number;
  avg_team_rank: number;
  teams_to_eliminations: number;
  best_elimination_progression: number;
  avg_elimination_progression: number;
  speakers_in_top10: number;
  speakers_in_top20: number;
  teams: Array<{
    team_id: Id<"teams">;
    team_name: string;
    wins: number;
    total_points: number;
    rank: number;
    eliminated_in_round?: number;
    reached_eliminations: boolean;
    elimination_progression: number;
  }>;
}

interface StudentRanking {
  rank: number;
  speaker_id: Id<"users">;
  speaker_name: string;
  speaker_email: string;
  team_id?: Id<"teams">;
  team_name?: string;
  school_id?: Id<"schools">;
  school_name?: string;
  total_speaker_points: number;
  average_speaker_score: number;
  team_wins: number;
  team_rank: number;
  debates_count: number;
  highest_individual_score: number;
  points_deviation: number;
  cross_tournament_performance: {
    tournaments_participated: number;
    avg_points_per_tournament: number;
    best_tournament_rank?: number;
  };
}

interface VolunteerRanking {
  rank: number;
  volunteer_id: Id<"users">;
  volunteer_name: string;
  volunteer_email: string;
  school_id?: Id<"schools">;
  school_name?: string;
  total_debates_judged: number;
  elimination_debates_judged: number;
  prelim_debates_judged: number;
  head_judge_assignments: number;
  attendance_score: number;
  avg_feedback_score: number;
  total_feedback_count: number;
  consistency_score: number;
  cross_tournament_stats: {
    tournaments_judged: number;
    total_debates_across_tournaments: number;
    avg_feedback_across_tournaments: number;
  };
}

const validateTournamentData = async (
  ctx: any,
  tournament: Doc<"tournaments">,
  scope: "prelims" | "full_tournament"
) => {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const debates = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const judgingScores = await ctx.db
    .query("judging_scores")
    .collect();

  const prelimRounds = rounds.filter((r: any) => r.type === "preliminary");
  const elimRounds = rounds.filter((r: any) => r.type === "elimination");

  const completedPrelimRounds = prelimRounds.filter((r: any) => r.status === "completed");
  const completedElimRounds = elimRounds.filter((r: any) => r.status === "completed");

  const prelimDebates = debates.filter((d: any) => {
    const round = rounds.find((r: any) => r._id === d.round_id);
    return round && round.type === "preliminary" && !d.is_public_speaking;
  });

  const elimDebates = debates.filter((d: any) => {
    const round = rounds.find((r: any) => r._id === d.round_id);
    return round && round.type === "elimination" && !d.is_public_speaking;
  });

  const completedPrelimDebates = prelimDebates.filter((d: any) => d.status === "completed");
  const completedElimDebates = elimDebates.filter((d: any) => d.status === "completed");

  const scoredPrelimDebates = completedPrelimDebates.filter((d: any) =>
    judgingScores.some((s: any) => s.debate_id === d._id)
  );

  const scoredElimDebates = completedElimDebates.filter((d: any) =>
    judgingScores.some((s: any) => s.debate_id === d._id)
  );

  if (scope === "full_tournament") {
    if (completedPrelimRounds.length < tournament.prelim_rounds) {
      throw new Error(
        `Rankings with full tournament data require all preliminary rounds to be completed. ` +
        `Currently ${completedPrelimRounds.length}/${tournament.prelim_rounds} prelim rounds completed.`
      );
    }

    if (completedElimRounds.length === 0) {
      throw new Error(
        "Rankings with full tournament data require at least one elimination round to be completed."
      );
    }

    if (scoredElimDebates.length === 0) {
      throw new Error(
        "Rankings with full tournament data require at least one elimination debate to have judging scores."
      );
    }
  } else {
    if (completedPrelimRounds.length === 0) {
      throw new Error(
        "Rankings require at least one preliminary round to be completed."
      );
    }

    if (scoredPrelimDebates.length === 0) {
      throw new Error(
        "Rankings require at least one preliminary debate to have judging scores."
      );
    }
  }

  return {
    prelimRounds: completedPrelimRounds.length,
    elimRounds: completedElimRounds.length,
    prelimDebates: scoredPrelimDebates.length,
    elimDebates: scoredElimDebates.length,
    totalScoredDebates: scoredPrelimDebates.length + scoredElimDebates.length
  };
};

const computeTeamRankings = async (
  ctx: any,
  tournament: Doc<"tournaments">,
  scope: "prelims" | "full_tournament"
): Promise<TeamRanking[]> => {
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const debates = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const allJudgingScores = await ctx.db
    .query("judging_scores")
    .collect();

  const relevantDebates = debates.filter((d: any) => {
    const round = rounds.find((r: any) => r._id === d.round_id);
    if (!round || d.is_public_speaking) return false;

    if (scope === "prelims") {
      return round.type === "preliminary";
    } else {
      return round.type === "preliminary" || round.type === "elimination";
    }
  });

  const relevantJudgingScores = allJudgingScores.filter((score: { debate_id: any; }) =>
    relevantDebates.some((debate: { _id: any; }) => debate._id === score.debate_id)
  );

  const teamStats = new Map<Id<"teams">, {
    team: Doc<"teams">;
    wins: number;
    losses: number;
    points: number;
    opponents: Array<{
      team_id: Id<"teams">;
      won: boolean;
      debate_id: Id<"debates">;
    }>;
    eliminated_in_round?: number;
  }>();

  for (const team of teams) {
    teamStats.set(team._id, {
      team,
      wins: 0,
      losses: 0,
      points: 0,
      opponents: [],
      eliminated_in_round: team.eliminated_in_round
    });
  }

  for (const debate of relevantDebates) {
    if (debate.status !== "completed" || !debate.winning_team_id) continue;

    const propTeamId = debate.proposition_team_id;
    const oppTeamId = debate.opposition_team_id;
    const winningTeamId = debate.winning_team_id;

    const debateScores = relevantJudgingScores.filter((score: { debate_id: any; }) => score.debate_id === debate._id);

    const teamPointsFromJudges = new Map<Id<"teams">, number>();

    for (const score of debateScores) {
      for (const speakerScore of score.speaker_scores) {
        const currentPoints = teamPointsFromJudges.get(speakerScore.team_id) || 0;
        teamPointsFromJudges.set(speakerScore.team_id, currentPoints + speakerScore.total);
      }
    }

    if (debateScores.length > 0) {
      teamPointsFromJudges.forEach((totalPoints, teamId) => {
        teamPointsFromJudges.set(teamId, totalPoints / debateScores.length);
      });
    }

    if (propTeamId && teamStats.has(propTeamId)) {
      const teamStat = teamStats.get(propTeamId)!;
      teamStat.points += teamPointsFromJudges.get(propTeamId) || 0;

      if (winningTeamId === propTeamId) {
        teamStat.wins++;
      } else {
        teamStat.losses++;
      }

      if (oppTeamId && teamStats.has(oppTeamId)) {
        teamStat.opponents.push({
          team_id: oppTeamId,
          won: winningTeamId === propTeamId,
          debate_id: debate._id
        });
      }
    }

    if (oppTeamId && teamStats.has(oppTeamId)) {
      const teamStat = teamStats.get(oppTeamId)!;
      teamStat.points += teamPointsFromJudges.get(oppTeamId) || 0;

      if (winningTeamId === oppTeamId) {
        teamStat.wins++;
      } else {
        teamStat.losses++;
      }

      if (propTeamId && teamStats.has(propTeamId)) {
        teamStat.opponents.push({
          team_id: propTeamId,
          won: winningTeamId === oppTeamId,
          debate_id: debate._id
        });
      }
    }
  }

  const rankings: TeamRanking[] = await Promise.all(
    Array.from(teamStats.entries()).map(async ([teamId, stats]) => {
      const school = stats.team.school_id ? await ctx.db.get(stats.team.school_id) : null;

      let opponentsWins = 0;
      let opponentsPoints = 0;
      let headToHeadWins = 0;

      for (const opponent of stats.opponents) {
        const opponentStats = teamStats.get(opponent.team_id);
        if (opponentStats) {
          opponentsWins += opponentStats.wins;
          opponentsPoints += opponentStats.points;
          if (opponent.won) {
            headToHeadWins++;
          }
        }
      }

      return {
        rank: 0,
        team_id: teamId,
        team_name: stats.team.name,
        school_id: school?._id,
        school_name: school?.name,
        school_type: school?.type,
        total_wins: stats.wins,
        total_losses: stats.losses,
        total_points: Math.round(stats.points * 100) / 100,
        opponents_total_wins: opponentsWins,
        opponents_total_points: Math.round(opponentsPoints * 100) / 100,
        head_to_head_wins: headToHeadWins,
        eliminated_in_round: stats.eliminated_in_round
      };
    })
  );

  rankings.sort((a, b) => {
    if (a.total_wins !== b.total_wins) {
      return b.total_wins - a.total_wins;
    }

    if (a.total_points !== b.total_points) {
      return b.total_points - a.total_points;
    }

    if (a.opponents_total_wins !== b.opponents_total_wins) {
      return b.opponents_total_wins - a.opponents_total_wins;
    }

    if (a.opponents_total_points !== b.opponents_total_points) {
      return b.opponents_total_points - a.opponents_total_points;
    }

    if (a.head_to_head_wins !== b.head_to_head_wins) {
      return b.head_to_head_wins - a.head_to_head_wins;
    }

    return a.team_name.localeCompare(b.team_name);
  });

  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return rankings;
};

const computeSchoolRankings = async (
  ctx: any,
  tournament: Doc<"tournaments">,
  scope: "prelims" | "full_tournament"
): Promise<SchoolRanking[]> => {
  const teamRankings = await computeTeamRankings(ctx, tournament, scope);

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const debates = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
    .collect();

  const speakerRankings = await computeStudentRankings(ctx, tournament, scope);
  const top10Speakers = speakerRankings.slice(0, 10).map(s => s.speaker_id);
  const top20Speakers = speakerRankings.slice(0, 20).map(s => s.speaker_id);

  const schoolStats = new Map<Id<"schools">, {
    school: Doc<"schools">;
    teams: Array<{
      team_id: Id<"teams">;
      team_name: string;
      wins: number;
      total_points: number;
      rank: number;
      eliminated_in_round?: number;
      reached_eliminations: boolean;
      elimination_progression: number;
    }>;
    total_teams: number;
    total_wins: number;
    total_points: number;
    best_team_rank: number;
    avg_team_rank: number;
    teams_to_eliminations: number;
    best_elimination_progression: number;
    avg_elimination_progression: number;
    speakers_in_top10: number;
    speakers_in_top20: number;
  }>();

  const getEliminationProgression = (teamId: Id<"teams">): { reached: boolean; progression: number } => {
    const elimRounds = rounds.filter((r: { type: string; }) => r.type === "elimination").sort((a: {
      round_number: number;
    }, b: { round_number: number; }) => a.round_number - b.round_number);

    if (elimRounds.length === 0) {
      return { reached: false, progression: 0 };
    }

    let maxProgression = 0;
    let reachedElims = false;

    for (let i = 0; i < elimRounds.length; i++) {
      const round = elimRounds[i];
      const teamDebatesInRound = debates.filter((d: { round_id: any; proposition_team_id: Id<"teams">; opposition_team_id: Id<"teams">; }) =>
        d.round_id === round._id &&
        (d.proposition_team_id === teamId || d.opposition_team_id === teamId)
      );

      if (teamDebatesInRound.length > 0) {
        reachedElims = true;
        maxProgression = i + 1;

        const wonRound = teamDebatesInRound.some((d: {
          winning_team_id: Id<"teams">;
        }) => d.winning_team_id === teamId);
        if (!wonRound) {
          break; // Eliminated in this round
        }
      }
    }

    return { reached: reachedElims, progression: maxProgression };
  };

  for (const teamRanking of teamRankings) {
    if (!teamRanking.school_id) continue;

    const school = await ctx.db.get(teamRanking.school_id);
    if (!school) continue;

    if (!schoolStats.has(teamRanking.school_id)) {
      schoolStats.set(teamRanking.school_id, {
        school,
        teams: [],
        total_teams: 0,
        total_wins: 0,
        total_points: 0,
        best_team_rank: 999,
        avg_team_rank: 0,
        teams_to_eliminations: 0,
        best_elimination_progression: 0,
        avg_elimination_progression: 0,
        speakers_in_top10: 0,
        speakers_in_top20: 0
      });
    }

    const schoolStat = schoolStats.get(teamRanking.school_id)!;
    const elimData = getEliminationProgression(teamRanking.team_id);

    schoolStat.teams.push({
      team_id: teamRanking.team_id,
      team_name: teamRanking.team_name,
      wins: teamRanking.total_wins,
      total_points: teamRanking.total_points,
      rank: teamRanking.rank,
      eliminated_in_round: teamRanking.eliminated_in_round,
      reached_eliminations: elimData.reached,
      elimination_progression: elimData.progression
    });

    schoolStat.total_teams++;
    schoolStat.total_wins += teamRanking.total_wins;
    schoolStat.total_points += teamRanking.total_points;
    schoolStat.best_team_rank = Math.min(schoolStat.best_team_rank, teamRanking.rank);

    if (elimData.reached) {
      schoolStat.teams_to_eliminations++;
      schoolStat.best_elimination_progression = Math.max(schoolStat.best_elimination_progression, elimData.progression);
    }

    const team = await ctx.db.get(teamRanking.team_id);
    if (team) {
      for (const speakerId of team.members) {
        if (top10Speakers.includes(speakerId)) {
          schoolStat.speakers_in_top10++;
        } else if (top20Speakers.includes(speakerId)) {
          schoolStat.speakers_in_top20++;
        }
      }
    }
  }

  const schoolRankings: SchoolRanking[] = Array.from(schoolStats.entries()).map(([schoolId, stats]) => {
    stats.avg_team_rank = stats.teams.reduce((sum, team) => sum + team.rank, 0) / stats.teams.length;

    const teamsWithElimProgression = stats.teams.filter(t => t.reached_eliminations);
    stats.avg_elimination_progression = teamsWithElimProgression.length > 0
      ? teamsWithElimProgression.reduce((sum, team) => sum + team.elimination_progression, 0) / teamsWithElimProgression.length
      : 0;

    return {
      rank: 0,
      school_id: schoolId,
      school_name: stats.school.name,
      school_type: stats.school.type,
      total_teams: stats.total_teams,
      total_wins: stats.total_wins,
      total_points: Math.round(stats.total_points * 100) / 100,
      best_team_rank: stats.best_team_rank,
      avg_team_rank: Math.round(stats.avg_team_rank * 100) / 100,
      teams: stats.teams.sort((a, b) => a.rank - b.rank),
      teams_to_eliminations: stats.teams_to_eliminations,
      best_elimination_progression: stats.best_elimination_progression,
      avg_elimination_progression: Math.round(stats.avg_elimination_progression * 100) / 100,
      speakers_in_top10: stats.speakers_in_top10,
      speakers_in_top20: stats.speakers_in_top20
    };
  });

  schoolRankings.sort((a, b) => {

    if (a.total_wins !== b.total_wins) {
      return b.total_wins - a.total_wins;
    }

    if (a.total_points !== b.total_points) {
      return b.total_points - a.total_points;
    }

    if (a.teams_to_eliminations !== b.teams_to_eliminations) {
      return b.teams_to_eliminations - a.teams_to_eliminations;
    }

    if (a.best_elimination_progression !== b.best_elimination_progression) {
      return b.best_elimination_progression - a.best_elimination_progression;
    }

    if (a.avg_elimination_progression !== b.avg_elimination_progression) {
      return b.avg_elimination_progression - a.avg_elimination_progression;
    }

    if (a.speakers_in_top10 !== b.speakers_in_top10) {
      return b.speakers_in_top10 - a.speakers_in_top10;
    }

    if (a.speakers_in_top20 !== b.speakers_in_top20) {
      return b.speakers_in_top20 - a.speakers_in_top20;
    }

    if (a.best_team_rank !== b.best_team_rank) {
      return a.best_team_rank - b.best_team_rank;
    }

    return a.school_name.localeCompare(b.school_name);
  });

  schoolRankings.forEach((school, index) => {
    school.rank = index + 1;
  });

  return schoolRankings;
};

const computeStudentCrossTournamentPerformance = async (
  ctx: any,
  speakerId: Id<"users">,
  currentTournamentId: Id<"tournaments">
) => {
  const currentTournament = await ctx.db.get(currentTournamentId);
  if (!currentTournament?.league_id) {
    return {
      tournaments_participated: 0,
      avg_points_per_tournament: 0,
      best_tournament_rank: undefined
    };
  }

  const leagueTournaments = await ctx.db
    .query("tournaments")
    .withIndex("by_league_id", (q: any) => q.eq("league_id", currentTournament.league_id))
    .filter((q: any) => q.neq(q.field("_id"), currentTournamentId))
    .collect();

  let totalPoints = 0;
  let tournamentsParticipated = 0;
  let bestRank = undefined;

  for (const tournament of leagueTournaments) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
      .collect();

    const speakerTeam = teams.find((team: { members: string | Id<"users">[]; }) => team.members.includes(speakerId));
    if (!speakerTeam) continue;

    const debates = await ctx.db
      .query("debates")
      .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
      .collect();

    const allScores = await ctx.db.query("judging_scores").collect();
    const tournamentScores = allScores.filter((score: { debate_id: any; }) =>
      debates.some((debate: { _id: any; }) => debate._id === score.debate_id)
    );

    let speakerTournamentPoints = 0;
    for (const score of tournamentScores) {
      for (const speakerScore of score.speaker_scores) {
        if (speakerScore.speaker_id === speakerId) {
          speakerTournamentPoints += speakerScore.total;
        }
      }
    }

    if (speakerTournamentPoints > 0) {
      totalPoints += speakerTournamentPoints;
      tournamentsParticipated++;

      const allSpeakerStats = new Map<Id<"users">, number>();
      for (const score of tournamentScores) {
        for (const speakerScore of score.speaker_scores) {
          const current = allSpeakerStats.get(speakerScore.speaker_id) || 0;
          allSpeakerStats.set(speakerScore.speaker_id, current + speakerScore.total);
        }
      }

      const sortedSpeakers = Array.from(allSpeakerStats.entries())
        .sort((a, b) => b[1] - a[1]);

      const speakerRank = sortedSpeakers.findIndex(([id]) => id === speakerId) + 1;
      if (speakerRank > 0) {
        bestRank = bestRank ? Math.min(bestRank, speakerRank) : speakerRank;
      }
    }
  }

  return {
    tournaments_participated: tournamentsParticipated,
    avg_points_per_tournament: tournamentsParticipated > 0 ? totalPoints / tournamentsParticipated : 0,
    best_tournament_rank: bestRank
  };
};

const computeStudentRankings = async (
  ctx: any,
  tournament: Doc<"tournaments">,
  scope: "prelims" | "full_tournament"
): Promise<StudentRanking[]> => {
  const teamRankings = await computeTeamRankings(ctx, tournament, scope);
  const teamRankingMap = new Map(teamRankings.map(tr => [tr.team_id, tr]));

  const allScores = await ctx.db.query("judging_scores").collect();
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const debates = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const relevantDebates = debates.filter((d: any) => {
    const round = rounds.find((r: any) => r._id === d.round_id);
    if (!round || d.is_public_speaking) return false;

    if (scope === "prelims") {
      return round.type === "preliminary";
    } else {
      return round.type === "preliminary" || round.type === "elimination";
    }
  });

  const relevantScores = allScores.filter((score: { debate_id: any; }) =>
    relevantDebates.some((debate: { _id: any; }) => debate._id === score.debate_id)
  );

  const speakerStats = new Map<Id<"users">, {
    speaker: Doc<"users">;
    team_id?: Id<"teams">;
    total_points: number;
    scores: number[];
    debates_count: number;
    highest_score: number;
  }>();

  for (const score of relevantScores) {
    for (const speakerScore of score.speaker_scores) {
      if (!speakerStats.has(speakerScore.speaker_id)) {
        const speaker = await ctx.db.get(speakerScore.speaker_id);
        if (!speaker) continue;

        const team = teams.find((t: { members: string | any[]; }) => t.members.includes(speakerScore.speaker_id));

        speakerStats.set(speakerScore.speaker_id, {
          speaker,
          team_id: team?._id,
          total_points: 0,
          scores: [],
          debates_count: 0,
          highest_score: 0,
        });
      }

      const speakerStat = speakerStats.get(speakerScore.speaker_id)!;
      speakerStat.total_points += speakerScore.total;
      speakerStat.scores.push(speakerScore.total);
      speakerStat.highest_score = Math.max(speakerStat.highest_score, speakerScore.total);
      speakerStat.debates_count++;
    }
  }

  const studentRankings: StudentRanking[] = await Promise.all(
    Array.from(speakerStats.entries()).map(async ([speakerId, stats]) => {
      const team = stats.team_id ? teams.find((t: { _id: Id<"teams"> | undefined; }) => t._id === stats.team_id) : null;
      const school = team?.school_id ? await ctx.db.get(team.school_id) : null;
      const teamRanking = stats.team_id ? teamRankingMap.get(stats.team_id) : null;

      const avgScore = stats.scores.length > 0 ? stats.total_points / stats.scores.length : 0;

      const mean = avgScore;
      const variance = stats.scores.length > 0
        ? stats.scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / stats.scores.length
        : 0;
      const deviation = Math.sqrt(variance);

      const crossPerformance = await computeStudentCrossTournamentPerformance(
        ctx,
        speakerId,
        tournament._id
      );

      return {
        rank: 0,
        speaker_id: speakerId,
        speaker_name: stats.speaker.name,
        speaker_email: stats.speaker.email,
        team_id: team?._id,
        team_name: team?.name,
        school_id: school?._id,
        school_name: school?.name,
        total_speaker_points: Math.round(stats.total_points * 100) / 100,
        average_speaker_score: Math.round(avgScore * 100) / 100,
        team_wins: teamRanking?.total_wins || 0,
        team_rank: teamRanking?.rank || 999,
        debates_count: stats.debates_count,
        highest_individual_score: stats.highest_score,
        points_deviation: Math.round(deviation * 100) / 100,
        cross_tournament_performance: {
          tournaments_participated: crossPerformance.tournaments_participated,
          avg_points_per_tournament: Math.round(crossPerformance.avg_points_per_tournament * 100) / 100,
          best_tournament_rank: crossPerformance.best_tournament_rank,
        },
      };
    })
  );

  studentRankings.sort((a, b) => {
    if (a.total_speaker_points !== b.total_speaker_points) {
      return b.total_speaker_points - a.total_speaker_points;
    }

    if (a.team_wins !== b.team_wins) {
      return b.team_wins - a.team_wins;
    }

    if (a.highest_individual_score !== b.highest_individual_score) {
      return b.highest_individual_score - a.highest_individual_score;
    }

    if (a.points_deviation !== b.points_deviation) {
      return a.points_deviation - b.points_deviation;
    }

    return a.speaker_name.localeCompare(b.speaker_name);
  });

  studentRankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return studentRankings;
};

const computeVolunteerCrossTournamentStats = async (
  ctx: any,
  volunteerId: Id<"users">,
  currentTournamentId: Id<"tournaments">
) => {
  const currentTournament = await ctx.db.get(currentTournamentId);
  if (!currentTournament?.league_id) {
    return {
      tournaments_judged: 0,
      total_debates_across_tournaments: 0,
      avg_feedback_across_tournaments: 0,
    };
  }

  const leagueTournaments = await ctx.db
    .query("tournaments")
    .withIndex("by_league_id", (q: any) => q.eq("league_id", currentTournament.league_id))
    .filter((q: any) => q.neq(q.field("_id"), currentTournamentId))
    .collect();

  let tournamentsJudged = 0;
  let totalDebatesAcrossTournaments = 0;
  let totalFeedbackScores = 0;
  let feedbackCount = 0;

  for (const tournament of leagueTournaments) {
    const debates = await ctx.db
      .query("debates")
      .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
      .collect();

    const judgedDebates = debates.filter((debate: { judges: string | Id<"users">[]; head_judge_id: Id<"users">; }) =>
      debate.judges.includes(volunteerId) || debate.head_judge_id === volunteerId
    );

    if (judgedDebates.length > 0) {
      tournamentsJudged++;
      totalDebatesAcrossTournaments += judgedDebates.length;

      const feedback = await ctx.db
        .query("judge_feedback")
        .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournament._id))
        .filter((q: any) => q.eq(q.field("judge_id"), volunteerId))
        .collect();

      for (const fb of feedback) {
        const avgScore = (fb.clarity + fb.fairness + fb.knowledge + fb.helpfulness) / 4;
        totalFeedbackScores += avgScore;
        feedbackCount++;
      }
    }
  }

  return {
    tournaments_judged: tournamentsJudged,
    total_debates_across_tournaments: totalDebatesAcrossTournaments,
    avg_feedback_across_tournaments: feedbackCount > 0 ? totalFeedbackScores / feedbackCount : 0,
  };
};

const computeVolunteerRankings = async (
  ctx: any,
  tournament: Doc<"tournaments">,
): Promise<VolunteerRanking[]> => {
  const debates = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const allFeedback = await ctx.db
    .query("judge_feedback")
    .withIndex("by_tournament_id", (q: { eq: (arg0: string, arg1: GenericId<"tournaments">) => any; }) => q.eq("tournament_id", tournament._id))
    .collect();

  const volunteerStats = new Map<Id<"users">, {
    volunteer: Doc<"users">;
    total_debates_judged: number;
    prelim_debates_judged: number;
    elimination_debates_judged: number;
    head_judge_assignments: number;
    feedback_scores: number[];
  }>();

  const allVolunteers = new Set<Id<"users">>();
  for (const debate of debates) {
    for (const judgeId of debate.judges) {
      allVolunteers.add(judgeId);
    }
    if (debate.head_judge_id) {
      allVolunteers.add(debate.head_judge_id);
    }
  }

  const volunteerArray = Array.from(allVolunteers);

  for (let i = 0; i < volunteerArray.length; i++) {
    const volunteerId = volunteerArray[i];
    const volunteer = await ctx.db.get(volunteerId);
    if (!volunteer) continue;

    volunteerStats.set(volunteerId, {
      volunteer,
      total_debates_judged: 0,
      prelim_debates_judged: 0,
      elimination_debates_judged: 0,
      head_judge_assignments: 0,
      feedback_scores: [],
    });
  }

  for (let i = 0; i < debates.length; i++) {
    const debate = debates[i];
    if (debate.status !== "completed") continue;

    const round = rounds.find((r: { _id: any; }) => r._id === debate.round_id);
    if (!round) continue;

    const isElimination = round.type === "elimination";
    const isPrelim = round.type === "preliminary";

    for (let j = 0; j < debate.judges.length; j++) {
      const judgeId = debate.judges[j];
      const stats = volunteerStats.get(judgeId);
      if (!stats) continue;

      stats.total_debates_judged++;
      if (isElimination) {
        stats.elimination_debates_judged++;
      } else if (isPrelim) {
        stats.prelim_debates_judged++;
      }
    }

    if (debate.head_judge_id) {
      const stats = volunteerStats.get(debate.head_judge_id);
      if (stats) {
        stats.head_judge_assignments++;
        if (!debate.judges.includes(debate.head_judge_id)) {
          stats.total_debates_judged++;
          if (isElimination) {
            stats.elimination_debates_judged++;
          } else if (isPrelim) {
            stats.prelim_debates_judged++;
          }
        }
      }
    }
  }

  for (let i = 0; i < allFeedback.length; i++) {
    const feedback = allFeedback[i];
    const stats = volunteerStats.get(feedback.judge_id);
    if (!stats) continue;

    const avgFeedbackScore = (
      feedback.clarity +
      feedback.fairness +
      feedback.knowledge +
      feedback.helpfulness
    ) / 4;

    stats.feedback_scores.push(avgFeedbackScore);
  }

  const volunteerRankings: VolunteerRanking[] = await Promise.all(
    Array.from(volunteerStats.entries()).map(async ([volunteerId, stats]) => {
      const school = stats.volunteer.school_id ? await ctx.db.get(stats.volunteer.school_id) : null;

      const attendanceScore = 5;

      const avgFeedbackScore = stats.feedback_scores.length > 0
        ? stats.feedback_scores.reduce((sum, score) => sum + score, 0) / stats.feedback_scores.length
        : 0;

      let consistencyScore = 100;
      if (stats.feedback_scores.length > 1) {
        const mean = avgFeedbackScore;
        const variance = stats.feedback_scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / stats.feedback_scores.length;
        const stdDev = Math.sqrt(variance);
        consistencyScore = Math.max(0, 100 - (stdDev * 20));
      }

      const crossTournamentStats = await computeVolunteerCrossTournamentStats(
        ctx,
        volunteerId,
        tournament._id
      );

      return {
        rank: 0,
        volunteer_id: volunteerId,
        volunteer_name: stats.volunteer.name,
        volunteer_email: stats.volunteer.email,
        school_id: school?._id,
        school_name: school?.name,
        total_debates_judged: stats.total_debates_judged,
        elimination_debates_judged: stats.elimination_debates_judged,
        prelim_debates_judged: stats.prelim_debates_judged,
        head_judge_assignments: stats.head_judge_assignments,
        attendance_score: attendanceScore, // Fixed at 5 points
        avg_feedback_score: Math.round(avgFeedbackScore * 100) / 100,
        total_feedback_count: stats.feedback_scores.length,
        consistency_score: Math.round(consistencyScore * 100) / 100,
        cross_tournament_stats: {
          tournaments_judged: crossTournamentStats.tournaments_judged,
          total_debates_across_tournaments: crossTournamentStats.total_debates_across_tournaments,
          avg_feedback_across_tournaments: Math.round(crossTournamentStats.avg_feedback_across_tournaments * 100) / 100,
        },
      };
    })
  );

  volunteerRankings.sort((a, b) => {

    const aScore = a.elimination_debates_judged * 2 + a.prelim_debates_judged;
    const bScore = b.elimination_debates_judged * 2 + b.prelim_debates_judged;
    if (aScore !== bScore) {
      return bScore - aScore;
    }


    if (a.avg_feedback_score !== b.avg_feedback_score) {
      return b.avg_feedback_score - a.avg_feedback_score;
    }

    if (a.consistency_score !== b.consistency_score) {
      return b.consistency_score - a.consistency_score;
    }

    return a.volunteer_name.localeCompare(b.volunteer_name);
  });

  volunteerRankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return volunteerRankings;
};

export const getTeamRankings = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    scope: v.union(v.literal("prelims"), v.literal("full_tournament")),
  },
  handler: async (ctx, args): Promise<RankingResponse<TeamRanking[]>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const user = sessionResult.user;

    if (user.role === "admin") {
      try {
        await validateTournamentData(ctx, tournament, args.scope);
        const rankings = await computeTeamRankings(ctx, tournament, args.scope);
        return {
          success: true,
          error: null,
          data: rankings,
          type: 'success'
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Team rankings not available: ${error.message}`,
          data: [],
          type: 'data_insufficient'
        };
      }
    }

    if (!tournament.ranking_released ||
      !tournament.ranking_released.visible_to_roles.includes(user.role)) {
      return {
        success: false,
        error: "Rankings not yet released for your role",
        data: [],
        type: 'not_released'
      };
    }

    if (!tournament.ranking_released[args.scope].teams) {
      return {
        success: false,
        error: "Team rankings not yet released for this scope",
        data: [],
        type: 'not_released'
      };
    }

    try {
      await validateTournamentData(ctx, tournament, args.scope);
    } catch (error: any) {
      return {
        success: false,
        error: `Team rankings not available: ${error.message}`,
        data: [],
        type: 'data_insufficient'
      };
    }

    const rankings = await computeTeamRankings(ctx, tournament, args.scope);

    return {
      success: true,
      error: null,
      data: rankings,
      type: 'success'
    };
  },
});

export const getSchoolRankings = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    scope: v.union(v.literal("prelims"), v.literal("full_tournament")),
  },
  handler: async (ctx, args): Promise<RankingResponse<SchoolRanking[]>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const user = sessionResult.user;

    if (user.role === "admin") {
      try {
        await validateTournamentData(ctx, tournament, args.scope);
        const rankings = await computeSchoolRankings(ctx, tournament, args.scope);
        return {
          success: true,
          error: null,
          data: rankings,
          type: 'success'
        };
      } catch (error: any) {
        return {
          success: false,
          error: `School rankings not available: ${error.message}`,
          data: [],
          type: 'data_insufficient'
        };
      }
    }

    if (!tournament.ranking_released ||
      !tournament.ranking_released.visible_to_roles.includes(user.role)) {
      return {
        success: false,
        error: "Rankings not yet released for your role",
        data: [],
        type: 'not_released'
      };
    }

    if (!tournament.ranking_released[args.scope].schools) {
      return {
        success: false,
        error: "School rankings not yet released for this scope",
        data: [],
        type: 'not_released'
      };
    }

    try {
      await validateTournamentData(ctx, tournament, args.scope);
    } catch (error: any) {
      return {
        success: false,
        error: `School rankings not available: ${error.message}`,
        data: [],
        type: 'data_insufficient'
      };
    }

    const rankings = await computeSchoolRankings(ctx, tournament, args.scope);

    return {
      success: true,
      error: null,
      data: rankings,
      type: 'success'
    };
  },
});

export const getStudentRankings = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    scope: v.union(v.literal("prelims"), v.literal("full_tournament")),
  },
  handler: async (ctx, args): Promise<RankingResponse<StudentRanking[]>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const user = sessionResult.user;

    if (user.role === "admin") {
      try {
        await validateTournamentData(ctx, tournament, args.scope);
        const rankings = await computeStudentRankings(ctx, tournament, args.scope);
        return {
          success: true,
          error: null,
          data: rankings,
          type: 'success'
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Student rankings not available: ${error.message}`,
          data: [],
          type: 'data_insufficient'
        };
      }
    }

    if (!tournament.ranking_released ||
      !tournament.ranking_released.visible_to_roles.includes(user.role)) {
      return {
        success: false,
        error: "Rankings not yet released for your role",
        data: [],
        type: 'not_released'
      };
    }

    if (!tournament.ranking_released[args.scope].students) {
      return {
        success: false,
        error: "Student rankings not yet released for this scope",
        data: [],
        type: 'not_released'
      };
    }

    try {
      await validateTournamentData(ctx, tournament, args.scope);
    } catch (error: any) {
      return {
        success: false,
        error: `Student rankings not available: ${error.message}`,
        data: [],
        type: 'data_insufficient'
      };
    }

    const rankings = await computeStudentRankings(ctx, tournament, args.scope);

    return {
      success: true,
      error: null,
      data: rankings,
      type: 'success'
    };
  },
});

export const getVolunteerRankings = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<RankingResponse<VolunteerRanking[]>> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const user = sessionResult.user;

    if (user.role === "admin") {
      try {
        await validateTournamentData(ctx, tournament, "prelims");
        const rankings = await computeVolunteerRankings(ctx, tournament);
        return {
          success: true,
          error: null,
          data: rankings,
          type: 'success'
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Volunteer rankings not available: ${error.message}`,
          data: [],
          type: 'data_insufficient'
        };
      }
    }

    if (!tournament.ranking_released ||
      !tournament.ranking_released.visible_to_roles.includes(user.role)) {
      return {
        success: false,
        error: "Rankings not yet released for your role",
        data: [],
        type: 'not_released'
      };
    }

    const volunteerRankingsEnabled = tournament.ranking_released.prelims.volunteers ||
      tournament.ranking_released.full_tournament.volunteers;

    if (!volunteerRankingsEnabled) {
      return {
        success: false,
        error: "Volunteer rankings not yet released",
        data: [],
        type: 'not_released'
      };
    }

    try {
      await validateTournamentData(ctx, tournament, "prelims");
    } catch (error: any) {
      return {
        success: false,
        error: `Volunteer rankings not available: ${error.message}`,
        data: [],
        type: 'data_insufficient'
      };
    }

    const rankings = await computeVolunteerRankings(ctx, tournament);

    return {
      success: true,
      error: null,
      data: rankings,
      type: 'success'
    };
  },
});

export const updateRankingRelease = mutation({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    ranking_settings: v.object({
      prelims: v.object({
        teams: v.boolean(),
        schools: v.boolean(),
        students: v.boolean(),
        volunteers: v.boolean(),
      }),
      full_tournament: v.object({
        teams: v.boolean(),
        schools: v.boolean(),
        students: v.boolean(),
        volunteers: v.boolean(),
      }),
      visible_to_roles: v.array(v.string()),
    }),
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

    const validRoles = ["student", "school_admin", "volunteer"];
    const invalidRoles = args.ranking_settings.visible_to_roles.filter(
      role => !validRoles.includes(role)
    );

    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
    }

    const previous = tournament.ranking_released;

    await ctx.db.patch(args.tournament_id, {
      ranking_released: args.ranking_settings,
      updated_at: Date.now(),
    });

    // Only scopes newly opened trigger mail, so re-saving the settings does
    // not send the announcement a second time.
    for (const scope of ["prelims", "full_tournament"] as const) {
      const now = args.ranking_settings[scope];
      const before = previous?.[scope];

      const newlyReleased = {
        students: now.students && !before?.students,
        teams: now.teams && !before?.teams,
        schools: now.schools && !before?.schools,
      };

      if (!newlyReleased.students && !newlyReleased.teams && !newlyReleased.schools) {
        continue;
      }

      await ctx.scheduler.runAfter(
        0,
        internal.functions.notification_emails.announceRankingRelease,
        {
          tournament_id: args.tournament_id,
          scope,
          released: newlyReleased,
        }
      );
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "tournament_updated",
      resource_type: "tournaments",
      resource_id: args.tournament_id,
      description: `Updated ranking release settings`,
    });

    return { success: true };
  },
});