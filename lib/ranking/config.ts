/**
 * League-wide ranking constants, signed off in `specs/ranking-model.md`.
 * Changing a weight here changes rankings everywhere; the logic that consumes
 * them does not hardcode any number.
 */

export const SCHOOL_WEIGHTS = {
  performance: 0.5,
  attendance: 0.4,
  hosting: 0.1,
} as const;

export const STUDENT_WEIGHTS = {
  performance: 0.8,
  participation: 0.2,
} as const;

export type SchoolTier = "elite" | "advanced" | "developing" | "beginner";

/** Percentile bands, top-down. A school below every cut-off is a beginner. */
export const TIER_PERCENTILES: Array<{ tier: SchoolTier; topPercentile: number }> = [
  { tier: "elite", topPercentile: 0.10 },
  { tier: "advanced", topPercentile: 0.35 },
  { tier: "developing", topPercentile: 0.75 },
];

export const TIER_LABELS: Record<SchoolTier, string> = {
  elite: "Elite School",
  advanced: "Advanced School",
  developing: "Developing School",
  beginner: "Beginner School",
};

/** A school cannot reach Elite on a tiny sample. */
export const ELITE_MIN_ACTIVITIES = 3;

/**
 * A school must sit at a new tier for this many consecutive evaluations before
 * the change takes effect, so tiers do not flap.
 */
export const TIER_CONFIRMATIONS_REQUIRED = 2;

/**
 * Speaker ranking basis differs by competition. Local tournaments deliberately
 * favour speakers who debate more; international ones rank on average with no
 * minimum-debates threshold.
 */
export type SpeakerRankingBasis = "total" | "average";

export function speakerBasisForLeague(leagueType: string | undefined): SpeakerRankingBasis {
  return leagueType === "International" ? "average" : "total";
}
