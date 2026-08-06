import { Doc, Id } from "../_generated/dataModel";

export interface TeamStanding {
  team_id: Id<"teams">;
  prelim_wins: number;
  prelim_losses: number;
  prelim_points: number;
  elimination_wins: number;
  elimination_losses: number;
  elimination_points: number;
  eliminated_in_round?: number;
  opponents_faced: Array<{
    opponent_team_id: Id<"teams">;
    debate_id: Id<"debates">;
    won: boolean;
    round_number: number;
    round_type: string;
  }>;
}

function pointsFor(debate: Doc<"debates">, teamId: Id<"teams">): number {
  return (
    (debate.proposition_team_id === teamId
      ? debate.proposition_team_points
      : debate.opposition_team_points) ?? 0
  );
}

/**
 * Recomputes every team's record from the debates that have a result.
 *
 * Standings were previously derived on every read, which meant a full scan of
 * the tournament's debates each time a ranking or a draw was needed. Computing
 * them once and storing them on the team keeps reads cheap and gives the
 * pairing engine a stable set of inputs.
 */
export function computeStandings(
  teams: Doc<"teams">[],
  debates: Doc<"debates">[],
  rounds: Doc<"rounds">[]
): TeamStanding[] {
  const roundById = new Map(rounds.map((round) => [round._id, round]));

  return teams.map((team) => {
    const standing: TeamStanding = {
      team_id: team._id,
      prelim_wins: 0,
      prelim_losses: 0,
      prelim_points: 0,
      elimination_wins: 0,
      elimination_losses: 0,
      elimination_points: 0,
      opponents_faced: [],
    };

    const played = debates.filter(
      (debate) =>
        debate.proposition_team_id === team._id || debate.opposition_team_id === team._id
    );

    for (const debate of played) {
      const round = roundById.get(debate.round_id);
      if (!round) continue;

      const isElim = round.type === "elimination";
      const points = pointsFor(debate, team._id);

      if (isElim) standing.elimination_points += points;
      else standing.prelim_points += points;

      // A bye is a win with no opponent, so it counts but is not a meeting.
      if (debate.is_bye) {
        if (isElim) standing.elimination_wins += 1;
        else standing.prelim_wins += 1;
        continue;
      }

      if (!debate.winning_team_id) continue;

      const won = debate.winning_team_id === team._id;

      if (isElim) {
        if (won) standing.elimination_wins += 1;
        else {
          standing.elimination_losses += 1;
          // Single elimination: one loss ends the run.
          standing.eliminated_in_round = round.round_number;
        }
      } else if (won) {
        standing.prelim_wins += 1;
      } else {
        standing.prelim_losses += 1;
      }

      const opponentId =
        debate.proposition_team_id === team._id
          ? debate.opposition_team_id
          : debate.proposition_team_id;

      if (opponentId) {
        standing.opponents_faced.push({
          opponent_team_id: opponentId,
          debate_id: debate._id,
          won,
          round_number: round.round_number,
          round_type: isElim ? "elimination" : "preliminary",
        });
      }
    }

    return standing;
  });
}

/** True when the stored record already matches, so the write can be skipped. */
export function matchesStored(team: Doc<"teams">, standing: TeamStanding): boolean {
  return (
    (team.prelim_wins ?? 0) === standing.prelim_wins &&
    (team.prelim_losses ?? 0) === standing.prelim_losses &&
    (team.prelim_points ?? 0) === standing.prelim_points &&
    (team.elimination_wins ?? 0) === standing.elimination_wins &&
    (team.elimination_losses ?? 0) === standing.elimination_losses &&
    (team.elimination_points ?? 0) === standing.elimination_points &&
    team.eliminated_in_round === standing.eliminated_in_round &&
    (team.opponents_faced ?? []).length === standing.opponents_faced.length
  );
}
