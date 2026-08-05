import type { PairingTeam, RoundStage } from "./types";

/**
 * Constraints are weighted penalties, not filters.
 *
 * The previous algorithm skipped any opponent that violated a constraint, and
 * when nothing survived the skips it simply left the team out of the round.
 * Costs mean the pairing engine always has an answer: it takes the least-bad
 * option and reports what it had to give up.
 */
export const PENALTIES = {
  /** Meeting the same team twice at one tournament is the worst outcome. */
  repeat_opponent: 10_000,
  /** Two teams from one school should not meet if anything else is possible. */
  same_school: 8_000,
  /** Met recently at another tournament; decays with age. */
  prior_opponent_recent: 400,
  prior_opponent_old: 120,
  /** Side imbalance, per debate of imbalance beyond one. */
  side_imbalance: 250,
  /** Distance in the standings, keeping like against like. */
  bracket_distance: 40,
} as const;

export function sideBalance(team: PairingTeam): number {
  const prop = team.side_history.filter((side) => side === "proposition").length;
  const opp = team.side_history.length - prop;

  return prop - opp;
}

/** How recently these teams met at other tournaments, or null if never. */
function priorMeetingIndex(team: PairingTeam, opponentId: string): number | null {
  const index = team.prior_opponents.indexOf(opponentId);

  return index === -1 ? null : index;
}

export interface CostBreakdown {
  total: number;
  reasons: string[];
}

export function pairingCost(
  a: PairingTeam,
  b: PairingTeam,
  stage: RoundStage
): CostBreakdown {
  let total = 0;
  const reasons: string[] = [];

  // Elimination rounds are single-elimination brackets: a rematch there is
  // normal and carries no penalty.
  if (stage === "prelim" && a.opponents_faced.includes(b.team_id)) {
    total += PENALTIES.repeat_opponent;
    reasons.push("repeat opponent");
  }

  if (a.school_id && a.school_id === b.school_id) {
    total += PENALTIES.same_school;
    reasons.push("same school");
  }

  const priorIndex = priorMeetingIndex(a, b.team_id);

  if (priorIndex !== null && stage === "prelim") {
    total +=
      priorIndex < 2 ? PENALTIES.prior_opponent_recent : PENALTIES.prior_opponent_old;
    reasons.push("met at a previous tournament");
  }

  const balanceA = sideBalance(a);
  const balanceB = sideBalance(b);

  // Pairing them is only useful if one can take proposition and the other
  // opposition without worsening both records.
  const bestImbalance = Math.min(
    Math.abs(balanceA + 1) + Math.abs(balanceB - 1),
    Math.abs(balanceA - 1) + Math.abs(balanceB + 1)
  );

  if (bestImbalance > 1) {
    total += (bestImbalance - 1) * PENALTIES.side_imbalance;
    reasons.push("side imbalance");
  }

  const bracketGap =
    Math.abs(a.wins - b.wins) * 10 + Math.abs(a.total_points - b.total_points) / 100;

  total += bracketGap * PENALTIES.bracket_distance;

  return { total, reasons };
}

/**
 * Which team takes proposition, chosen to even out both teams' side records.
 * Ties break on team id so the same inputs always give the same sides.
 */
export function assignSides(
  a: PairingTeam,
  b: PairingTeam
): { proposition: PairingTeam; opposition: PairingTeam } {
  const balanceA = sideBalance(a);
  const balanceB = sideBalance(b);

  if (balanceA < balanceB) return { proposition: a, opposition: b };
  if (balanceB < balanceA) return { proposition: b, opposition: a };

  return a.team_id < b.team_id
    ? { proposition: a, opposition: b }
    : { proposition: b, opposition: a };
}
