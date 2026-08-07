import { SCHOOL_WEIGHTS, STUDENT_WEIGHTS, type SpeakerRankingBasis } from "./config";

export interface SchoolComponents {
  /** Each already normalised to 0–100. */
  performance: number;
  attendance: number;
  hosting: number;
}

export function schoolScore(components: SchoolComponents): number {
  return round2(
    components.performance * SCHOOL_WEIGHTS.performance +
    components.attendance * SCHOOL_WEIGHTS.attendance +
    components.hosting * SCHOOL_WEIGHTS.hosting
  );
}

export interface StudentComponents {
  performance: number;
  participation: number;
}

export function studentScore(components: StudentComponents): number {
  return round2(
    components.performance * STUDENT_WEIGHTS.performance +
    components.participation * STUDENT_WEIGHTS.participation
  );
}

/**
 * Team score is performance plus the school's participation, added exactly
 * once. The deliverables call out double-counting here specifically, so the
 * two figures are kept separate and summed in one place.
 */
export function teamScore(performance: number, inheritedParticipation: number): number {
  return round2(performance + inheritedParticipation);
}

export interface SpeakerRecord {
  speaker_id: string;
  total_points: number;
  debates_count: number;
  team_wins: number;
  highest_score: number;
  points_deviation: number;
  name: string;
}

/**
 * Local competitions rank on total points, deliberately favouring speakers who
 * debate more. International competitions rank on average, with no
 * minimum-debates threshold.
 */
export function rankSpeakers(
  speakers: SpeakerRecord[],
  basis: SpeakerRankingBasis
): Array<SpeakerRecord & { rank: number; ranking_value: number }> {
  const withValue = speakers.map((speaker) => ({
    ...speaker,
    ranking_value:
      basis === "average"
        ? speaker.debates_count > 0
          ? round2(speaker.total_points / speaker.debates_count)
          : 0
        : speaker.total_points,
  }));

  withValue.sort(
    (a, b) =>
      b.ranking_value - a.ranking_value ||
      b.team_wins - a.team_wins ||
      b.highest_score - a.highest_score ||
      a.points_deviation - b.points_deviation ||
      a.name.localeCompare(b.name)
  );

  return withValue.map((speaker, index) => ({ ...speaker, rank: index + 1 }));
}

export type Stage = "prelims" | "elims";

export interface StageResult {
  debated_rounds: number;
  points_from_debated_rounds: number;
  bye_rounds: number;
}

export interface ByeCredit {
  wins: number;
  points: number;
  /** True when a bye is owed points that cannot be known yet. */
  pending: boolean;
}

/**
 * A bye counts as a win, with speaker points equal to the team's average
 * across the rounds it actually debated in the same stage. Prelims and elims
 * never mix, and because the average depends on rounds not yet played, the
 * credit is only final once the stage is complete. Mid-stage the points are
 * pending rather than zero, so a team is not shown losing ground.
 */
export function byeCredit(result: StageResult, stageComplete: boolean): ByeCredit {
  if (result.bye_rounds === 0) {
    return { wins: 0, points: 0, pending: false };
  }

  if (!stageComplete || result.debated_rounds === 0) {
    return { wins: result.bye_rounds, points: 0, pending: true };
  }

  const average = result.points_from_debated_rounds / result.debated_rounds;

  return {
    wins: result.bye_rounds,
    points: round2(average * result.bye_rounds),
    pending: false,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
