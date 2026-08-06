import { generatePairings } from "./engine";
import { pairingCost } from "./cost";
import type { PairingJudge, PairingTeam, RoundStage } from "./types";

/**
 * Bridges the shapes the pairing screen already holds onto the shared engine.
 *
 * The screen keeps working with the records it gets from Convex; the draw
 * itself comes from the one module the server also runs, so a draw produced
 * here reproduces exactly when the server re-runs it on sync.
 */
export interface ScreenTeam {
  _id: string;
  name: string;
  school_id?: string;
  side_history?: Array<"proposition" | "opposition">;
  opponents_faced?: string[];
  wins?: number;
  total_points?: number;
  bye_rounds?: number[];
  cross_tournament_opponents?: string[];
}

export interface ScreenJudge {
  _id: string;
  name: string;
  school_id?: string;
  total_debates_judged?: number;
  elimination_debates?: number;
  avg_feedback_score?: number;
  conflicts?: string[];
}

export interface ScreenConflict {
  type: string;
  description: string;
  severity: "warning" | "error";
}

export interface ScreenPairing {
  room_name: string;
  proposition_team_id?: string;
  opposition_team_id?: string;
  judges: string[];
  head_judge_id?: string;
  is_bye_round: boolean;
  conflicts: ScreenConflict[];
  quality_score: number;
}

/**
 * A repeat opponent or a judge's own school makes a room unusable; a meeting
 * at an earlier tournament or a side imbalance is worth showing but does not
 * block the round.
 */
const ERRORS = new Set(["repeat opponent", "same school"]);

function toConflict(reason: string): ScreenConflict {
  return {
    type: reason,
    description: reason,
    severity: ERRORS.has(reason) ? "error" : "warning",
  };
}

export function toPairingTeam(team: ScreenTeam): PairingTeam {
  return {
    team_id: team._id,
    name: team.name,
    school_id: team.school_id,
    wins: team.wins ?? 0,
    total_points: team.total_points ?? 0,
    opponents_faced: team.opponents_faced ?? [],
    prior_opponents: team.cross_tournament_opponents ?? [],
    side_history: team.side_history ?? [],
    bye_rounds: team.bye_rounds ?? [],
  };
}

export function toPairingJudge(judge: ScreenJudge): PairingJudge {
  return {
    judge_id: judge._id,
    name: judge.name,
    school_id: judge.school_id,
    conflicts: judge.conflicts ?? [],
    debates_judged: judge.total_debates_judged ?? 0,
    elimination_debates: judge.elimination_debates ?? 0,
    feedback_score: judge.avg_feedback_score ?? 3,
  };
}

/**
 * The seed the server derives for the same round, so a draw generated on a
 * device matches the one the server computes when it verifies.
 */
export function seedFor(roundNumber: number, teamCount: number): number {
  return roundNumber * 7919 + teamCount;
}

/** A cost of zero is a clean pairing; the scale keeps the screen's 0–100 read. */
function qualityScore(cost: number): number {
  return Math.max(0, Math.round(100 - Math.min(cost, 10_000) / 100));
}

export function generateScreenPairings(
  screenTeams: ScreenTeam[],
  screenJudges: ScreenJudge[],
  options: {
    round_number: number;
    stage: RoundStage;
    judges_per_debate: number;
    rooms?: string[];
  }
): { pairings: ScreenPairing[]; warnings: string[]; unpaired: string[] } {
  const teams = screenTeams.map(toPairingTeam);
  const judges = screenJudges.map(toPairingJudge);
  const byId = new Map(teams.map((team) => [team.team_id, team]));

  const result = generatePairings({
    teams,
    judges,
    rooms: (options.rooms ?? []).map((name) => ({ name })),
    round_number: options.round_number,
    stage: options.stage,
    judges_per_debate: options.judges_per_debate,
    seed: seedFor(options.round_number, teams.length),
  });

  const pairings = result.debates.map((debate) => {
    const prop = debate.proposition_team_id ? byId.get(debate.proposition_team_id) : null;
    const opp = debate.opposition_team_id ? byId.get(debate.opposition_team_id) : null;

    const cost =
      prop && opp ? pairingCost(prop, opp, options.stage).total : 0;

    return {
      room_name: debate.room_name,
      proposition_team_id: debate.proposition_team_id ?? undefined,
      opposition_team_id: debate.opposition_team_id ?? undefined,
      judges: debate.judges,
      head_judge_id: debate.head_judge_id,
      is_bye_round: debate.is_bye,
      conflicts: debate.compromises.map(toConflict),
      quality_score: debate.is_bye ? 100 : qualityScore(cost),
    };
  });

  return { pairings, warnings: result.warnings, unpaired: result.unpaired };
}

/**
 * The constraints a pairing breaks, for a room the tab team edited by hand.
 * Manual edits go through the same cost model as generated ones, so an
 * override cannot quietly reintroduce a clash the engine would have avoided.
 */
export function validatePairing(
  screenTeams: ScreenTeam[],
  screenJudges: ScreenJudge[],
  propId: string | null | undefined,
  oppId: string | null | undefined,
  judgeIds: string[],
  stage: RoundStage = "prelim"
): ScreenConflict[] {
  if (!propId || !oppId) return [];

  const teams = new Map(screenTeams.map((team) => [team._id, toPairingTeam(team)]));
  const prop = teams.get(propId);
  const opp = teams.get(oppId);

  if (!prop || !opp) return [];

  if (propId === oppId) {
    return [
      {
        type: "same team",
        description: "A team cannot debate itself",
        severity: "error",
      },
    ];
  }

  const conflicts = pairingCost(prop, opp, stage).reasons.map(toConflict);

  for (const judgeId of judgeIds) {
    const judge = screenJudges.find((entry) => entry._id === judgeId);
    if (!judge) continue;

    if (judge.school_id && (judge.school_id === prop.school_id || judge.school_id === opp.school_id)) {
      conflicts.push({
        type: "judge school",
        description: `${judge.name} judges their own school`,
        severity: "error",
      });
    }

    if ((judge.conflicts ?? []).some((id) => id === propId || id === oppId)) {
      conflicts.push({
        type: "judge conflict",
        description: `${judge.name} has a declared conflict in this room`,
        severity: "error",
      });
    }
  }

  return conflicts;
}
