import {
  ELITE_MIN_ACTIVITIES,
  TIER_CONFIRMATIONS_REQUIRED,
  TIER_PERCENTILES,
  type SchoolTier,
} from "./config";

export interface TierCandidate {
  school_id: string;
  score: number;
  verified_activities: number;
}

export interface TierAssignment {
  school_id: string;
  tier: SchoolTier;
  rank: number;
  percentile: number;
}

/**
 * Assigns tiers by percentile rather than absolute score, so the bands stay
 * meaningful as the league grows and a school can move down as others improve.
 *
 * Ties share a rank, so two schools on the same score cannot land in different
 * tiers purely because of list order.
 */
export function assignTiers(candidates: TierCandidate[]): TierAssignment[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.school_id.localeCompare(b.school_id)
  );

  const assignments: TierAssignment[] = [];
  let rank = 0;
  let previousScore: number | null = null;
  let sharedRank = 0;

  sorted.forEach((candidate, index) => {
    rank = index + 1;

    if (previousScore !== null && candidate.score === previousScore) {
      rank = sharedRank;
    } else {
      sharedRank = rank;
    }

    previousScore = candidate.score;

    // Measured from the top, so the leading school sits at 0 and a one-school
    // league does not fall through every band.
    const percentile = (rank - 1) / sorted.length;
    const band = TIER_PERCENTILES.find((entry) => percentile < entry.topPercentile);
    let tier: SchoolTier = band?.tier ?? "beginner";

    if (tier === "elite" && candidate.verified_activities < ELITE_MIN_ACTIVITIES) {
      tier = "advanced";
    }

    assignments.push({ school_id: candidate.school_id, tier, rank, percentile });
  });

  return assignments;
}

export interface TierState {
  current: SchoolTier;
  pending?: SchoolTier;
  pending_count?: number;
}

export interface TierTransition {
  tier: SchoolTier;
  pending?: SchoolTier;
  pending_count: number;
  changed: boolean;
  provisional: boolean;
}

/**
 * Damps tier movement: a school must be evaluated at the new tier twice in a
 * row before it takes effect. Until then the committed tier stands and the
 * pending one is shown as provisional.
 */
export function applyTierDamping(
  state: TierState | null,
  evaluated: SchoolTier
): TierTransition {
  if (!state) {
    return { tier: evaluated, pending_count: 0, changed: true, provisional: false };
  }

  if (evaluated === state.current) {
    return {
      tier: state.current,
      pending_count: 0,
      changed: false,
      provisional: false,
    };
  }

  const streak = state.pending === evaluated ? (state.pending_count ?? 0) + 1 : 1;

  if (streak >= TIER_CONFIRMATIONS_REQUIRED) {
    return { tier: evaluated, pending_count: 0, changed: true, provisional: false };
  }

  return {
    tier: state.current,
    pending: evaluated,
    pending_count: streak,
    changed: false,
    provisional: true,
  };
}
