import { Doc, Id } from "../_generated/dataModel";
import type { PairingJudge, PairingTeam } from "../../lib/pairing/types";

/**
 * Builds the pairing engine's inputs from stored records.
 *
 * Both the device and the server build them the same way, so the server can
 * re-run a draw a device produced offline and check the result matches.
 */
export async function buildPairingTeams(
  ctx: any,
  tournamentId: Id<"tournaments">,
  /**
   * The round being paired. Its own debates are excluded, so re-pairing a
   * round reads the same history the first attempt did and reproduces the
   * same draw. Without this a device's offline draw could never be verified
   * against a round the server has already stored.
   */
  excludeRound?: number
): Promise<PairingTeam[]> {
  const teams: Doc<"teams">[] = (await ctx.db
    .query("teams")
    .withIndex("by_tournament_id_status", (q: any) =>
      q.eq("tournament_id", tournamentId).eq("status", "active")
    )
    .collect());

  const rounds: Doc<"rounds">[] = await ctx.db
    .query("rounds")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournamentId))
    .collect();

  const roundNumber = new Map(rounds.map((round) => [round._id, round.round_number]));

  const allDebates: Doc<"debates">[] = await ctx.db
    .query("debates")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournamentId))
    .collect();

  const debates =
    excludeRound === undefined
      ? allDebates
      : allDebates.filter((debate) => roundNumber.get(debate.round_id) !== excludeRound);

  // Meetings at other tournaments, most recent first, so the cost model can
  // weigh a recent meeting more heavily than an old one.
  const priorByTeam = new Map<string, string[]>();

  for (const team of teams) {
    const history = (team.opponents_faced ?? [])
      .filter((entry) => entry.round_type === "cross_tournament")
      .map((entry) => entry.opponent_team_id as string);

    priorByTeam.set(team._id, history);
  }

  return teams.map((team) => {
    const played = debates.filter(
      (debate) =>
        debate.proposition_team_id === team._id || debate.opposition_team_id === team._id
    );

    const sideHistory = played
      .filter((debate) => !debate.is_bye)
      .map((debate) =>
        debate.proposition_team_id === team._id
          ? ("proposition" as const)
          : ("opposition" as const)
      );

    const opponents = played
      .map((debate) =>
        debate.proposition_team_id === team._id
          ? debate.opposition_team_id
          : debate.proposition_team_id
      )
      .filter(Boolean) as string[];

    const wins = debates.filter((debate) => debate.winning_team_id === team._id).length;

    const points = played.reduce((total, debate) => {
      const isProp = debate.proposition_team_id === team._id;
      return total + ((isProp ? debate.proposition_team_points : debate.opposition_team_points) ?? 0);
    }, 0);

    const byeRounds = played
      .filter((debate) => debate.is_bye)
      .map((debate) => roundNumber.get(debate.round_id) ?? 0);

    return {
      team_id: team._id,
      name: team.name,
      school_id: team.school_id,
      wins,
      total_points: points,
      opponents_faced: opponents,
      prior_opponents: priorByTeam.get(team._id) ?? [],
      side_history: sideHistory,
      bye_rounds: byeRounds,
    };
  });
}

export async function buildPairingJudges(
  ctx: any,
  tournamentId: Id<"tournaments">
): Promise<PairingJudge[]> {
  const invitations = await ctx.db
    .query("tournament_invitations")
    .withIndex("by_tournament_id_target_type_status", (q: any) =>
      q
        .eq("tournament_id", tournamentId)
        .eq("target_type", "volunteer")
        .eq("status", "accepted")
    )
    .collect();

  const results = await ctx.db
    .query("judge_results")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournamentId))
    .collect();

  const resultByJudge = new Map(
    results.map((result: Doc<"judge_results">) => [result.judge_id, result])
  );

  const judges = await Promise.all(
    invitations.map((invitation: Doc<"tournament_invitations">) =>
      ctx.db.get(invitation.target_id)
    )
  );

  return judges
    .filter((judge): judge is Doc<"users"> => !!judge && judge.status === "active")
    .map((judge) => {
      const record = resultByJudge.get(judge._id) as Doc<"judge_results"> | undefined;

      return {
        judge_id: judge._id,
        name: judge.name,
        school_id: judge.school_id,
        // Declared clashes are not yet modelled as their own table; a judge's
        // own school is handled by the engine.
        conflicts: [],
        debates_judged: record?.total_debates_judged ?? 0,
        elimination_debates: record?.elimination_debates_judged ?? 0,
        feedback_score: record?.avg_feedback_score ?? 3,
      };
    });
}

/**
 * A stable digest of the inputs a draw was computed from. Storing it with the
 * round lets the server confirm a device pairing used the same data, rather
 * than trusting a draw it cannot reproduce.
 */
export function inputsFingerprint(teams: PairingTeam[]): string {
  const canonical = [...teams]
    .map(
      (team) =>
        `${team.team_id}:${team.wins}:${team.total_points}:${team.opponents_faced.slice().sort().join(",")}`
    )
    .sort()
    .join("|");

  let hash = 5381;

  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(index)) >>> 0;
  }

  return `${hash.toString(36)}-${teams.length}`;
}
