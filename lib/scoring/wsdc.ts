/**
 * World Schools scoring rules, per WS-Scoring-Guide and WSDC Scoring Rubric.
 * These are rulebook constants, not product decisions — do not tune them.
 *
 * This module is the single source of truth for both client and server, and
 * is deliberately free of React and Convex imports so it can run anywhere.
 */

export type SpeechType = "substantive" | "reply";

export type SpeakerPosition = "first" | "second" | "third" | "reply";

export interface SpeechScore {
  style: number;
  content: number;
  strategy: number;
  poi_modifier?: number;
}

export const SUBSTANTIVE_RANGES = {
  style: { min: 24, max: 32 },
  content: { min: 24, max: 32 },
  strategy: { min: 12, max: 16 },
  total: { min: 60, max: 80 },
} as const;

export const AVERAGE_SPEECH = { style: 28, content: 28, strategy: 14, total: 70 } as const;

export const POI_MODIFIER_LIMIT = 2;

/** Half marks are the lowest fraction allowed. */
export const SCORE_INCREMENT = 0.5;

export const SCORING_CRITERIA = [
  {
    key: "style" as const,
    label: "Style",
    weight: "40%",
    description: "Delivery, clarity, pace, volume, and engagement",
  },
  {
    key: "content" as const,
    label: "Content",
    weight: "40%",
    description: "Arguments, evidence, analysis, and rebuttal",
  },
  {
    key: "strategy" as const,
    label: "Strategy",
    weight: "20%",
    description: "Structure, prioritisation, timing, and role fulfilment",
  },
];

/**
 * Reply speeches are marked on the same criteria, then halved, so every range
 * and increment for a reply is exactly half its substantive counterpart.
 */
export function rangesFor(speechType: SpeechType) {
  if (speechType === "substantive") return SUBSTANTIVE_RANGES;

  return {
    style: { min: 12, max: 16 },
    content: { min: 12, max: 16 },
    strategy: { min: 6, max: 8 },
    total: { min: 30, max: 40 },
  } as const;
}

export function averageFor(speechType: SpeechType) {
  if (speechType === "substantive") return AVERAGE_SPEECH;
  return { style: 14, content: 14, strategy: 7, total: 35 } as const;
}

export function isHalfMark(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 2) === value * 2;
}

export interface ScoreValidationIssue {
  field: "style" | "content" | "strategy" | "poi_modifier" | "total";
  message: string;
}

export function validateSpeechScore(
  score: SpeechScore,
  speechType: SpeechType
): ScoreValidationIssue[] {
  const ranges = rangesFor(speechType);
  const issues: ScoreValidationIssue[] = [];

  (["style", "content", "strategy"] as const).forEach((field) => {
    const value = score[field];
    const range = ranges[field];

    if (!Number.isFinite(value)) {
      issues.push({ field, message: `${field} is required` });
      return;
    }

    if (!isHalfMark(value)) {
      issues.push({ field, message: `${field} must be in half-mark increments` });
    }

    if (value < range.min || value > range.max) {
      issues.push({
        field,
        message: `${field} must be between ${range.min} and ${range.max}`,
      });
    }
  });

  const poi = score.poi_modifier ?? 0;

  if (!Number.isFinite(poi) || !isHalfMark(poi)) {
    issues.push({
      field: "poi_modifier",
      message: "Points of Information modifier must be in half-mark increments",
    });
  } else if (Math.abs(poi) > POI_MODIFIER_LIMIT) {
    issues.push({
      field: "poi_modifier",
      message: `Points of Information modifier must be between -${POI_MODIFIER_LIMIT} and ${POI_MODIFIER_LIMIT}`,
    });
  }

  return issues;
}

/**
 * The POI modifier adjusts the total but may never push it outside the band,
 * so it is applied and then clamped rather than rejected.
 */
export function speechTotal(score: SpeechScore, speechType: SpeechType): number {
  const ranges = rangesFor(speechType);
  const base = score.style + score.content + score.strategy;
  const adjusted = base + (score.poi_modifier ?? 0);

  return Math.min(Math.max(adjusted, ranges.total.min), ranges.total.max);
}

export function teamTotal(
  speeches: Array<{ score: SpeechScore; speech_type: SpeechType }>
): number {
  return speeches.reduce(
    (total, speech) => total + speechTotal(speech.score, speech.speech_type),
    0
  );
}

export type MarginBand =
  | "very_close"
  | "close_but_clear"
  | "clearly_better"
  | "dominated"
  | "shredded";

export function marginBand(margin: number): MarginBand {
  const value = Math.abs(margin);

  if (value <= 2) return "very_close";
  if (value <= 5) return "close_but_clear";
  if (value <= 10) return "clearly_better";
  if (value <= 20) return "dominated";
  return "shredded";
}

export const MARGIN_BAND_LABELS: Record<MarginBand, string> = {
  very_close: "Very close debate",
  close_but_clear: "Close but rather clear",
  clearly_better: "One team clearly better, but not dominating",
  dominated: "Winning team dominated the debate",
  shredded: "Winning team shredded the losing team",
};

export interface OutcomeValidation {
  valid: boolean;
  error?: "low_point_win" | "draw";
  message?: string;
  margin: number;
}

/**
 * The winning team's total must exceed the losing team's. A judge whose
 * scores contradict their decision has to revise one or the other — neither
 * a low-point win nor a draw may be silently accepted.
 */
export function validateOutcome(
  winningTeamTotal: number,
  losingTeamTotal: number
): OutcomeValidation {
  const margin = winningTeamTotal - losingTeamTotal;

  if (margin === 0) {
    return {
      valid: false,
      error: "draw",
      message:
        "The teams have equal totals. World Schools does not allow draws — adjust the scores so the winning team totals more.",
      margin,
    };
  }

  if (margin < 0) {
    return {
      valid: false,
      error: "low_point_win",
      message:
        "The team you selected as the winner has fewer total points than the team that lost. Either change the winner or revise the scores.",
      margin,
    };
  }

  return { valid: true, margin };
}
