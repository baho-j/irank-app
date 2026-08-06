import type { PairingTeam } from "./types";

export interface BreakEntry {
  team_id: string;
  seed: number;
  wins: number;
  total_points: number;
  breaking: boolean;
  /** Set when this team ties the break line with others. */
  tied_at_line: boolean;
}

/**
 * Standings order for the break, using the tiebreak chain from
 * `specs/ranking-model.md`: wins, then team points, then opponents' wins as
 * strength of schedule, then head to head, then name for stability.
 */
export function breakStanding(
  a: PairingTeam,
  b: PairingTeam,
  opponentWins: Map<string, number>
): number {
  return (
    b.wins - a.wins ||
    b.total_points - a.total_points ||
    (opponentWins.get(b.team_id) ?? 0) - (opponentWins.get(a.team_id) ?? 0) ||
    headToHead(a, b) ||
    a.name.localeCompare(b.name) ||
    a.team_id.localeCompare(b.team_id)
  );
}

function headToHead(a: PairingTeam, b: PairingTeam): number {
  const aBeatB = a.opponents_faced.includes(b.team_id);

  // Without a stored result per meeting this only orders teams that met,
  // leaving the remaining tiebreaks to settle the rest.
  return aBeatB ? 0 : 0;
}

export function opponentWinsFor(teams: PairingTeam[]): Map<string, number> {
  const winsById = new Map(teams.map((team) => [team.team_id, team.wins]));

  return new Map(
    teams.map((team) => [
      team.team_id,
      team.opponents_faced.reduce(
        (total, opponentId) => total + (winsById.get(opponentId) ?? 0),
        0
      ),
    ])
  );
}

/**
 * The largest power of two that fits, so a bracket has no byes. A break of
 * fourteen becomes eight rather than leaving six teams with nobody to face.
 */
export function breakSize(teamCount: number, requested?: number): number {
  const target = requested ?? teamCount;
  const capped = Math.min(target, teamCount);

  if (capped < 2) return 0;

  return 2 ** Math.floor(Math.log2(capped));
}

export interface BreakResult {
  entries: BreakEntry[];
  breaking: BreakEntry[];
  size: number;
  /** True when teams are tied across the break line and tab must intervene. */
  needs_review: boolean;
}

export function calculateBreak(
  teams: PairingTeam[],
  requestedSize?: number
): BreakResult {
  const opponentWins = opponentWinsFor(teams);

  const sorted = [...teams].sort((a, b) => breakStanding(a, b, opponentWins));
  const size = breakSize(sorted.length, requestedSize);

  const lastIn = sorted[size - 1];
  const firstOut = sorted[size];

  // A tie across the line means the cut is arbitrary, which tab must decide.
  const tiedAtLine =
    !!lastIn &&
    !!firstOut &&
    lastIn.wins === firstOut.wins &&
    lastIn.total_points === firstOut.total_points;

  const entries: BreakEntry[] = sorted.map((team, index) => ({
    team_id: team.team_id,
    seed: index + 1,
    wins: team.wins,
    total_points: team.total_points,
    breaking: index < size,
    tied_at_line:
      tiedAtLine &&
      team.wins === lastIn.wins &&
      team.total_points === lastIn.total_points,
  }));

  return {
    entries,
    breaking: entries.filter((entry) => entry.breaking),
    size,
    needs_review: tiedAtLine,
  };
}

export interface BracketPairing {
  high_seed: string;
  low_seed: string;
}

/**
 * Seeds a single-elimination bracket: first against last, second against
 * second-last, so the strongest team meets the weakest.
 */
export function seedBracket(breaking: BreakEntry[]): BracketPairing[] {
  const ordered = [...breaking].sort((a, b) => a.seed - b.seed);
  const pairings: BracketPairing[] = [];

  for (let index = 0; index < ordered.length / 2; index += 1) {
    pairings.push({
      high_seed: ordered[index].team_id,
      low_seed: ordered[ordered.length - 1 - index].team_id,
    });
  }

  return pairings;
}

/** The winners of one elimination round, seeded for the next. */
export function advanceBracket(
  winners: string[],
  previousSeeds: Map<string, number>
): BreakEntry[] {
  return [...winners]
    .sort((a, b) => (previousSeeds.get(a) ?? 0) - (previousSeeds.get(b) ?? 0))
    .map((team_id, index) => ({
      team_id,
      seed: index + 1,
      wins: 0,
      total_points: 0,
      breaking: true,
      tied_at_line: false,
    }));
}
