import { v } from "convex/values";
import {
  speechTotal,
  validateOutcome,
  validateSpeechScore,
  type SpeechType,
} from "../../lib/scoring/wsdc";
import { Id } from "../_generated/dataModel";

export const speakerScoreValidator = v.object({
  speaker_id: v.id("users"),
  team_id: v.id("teams"),
  position: v.union(
    v.literal("first"),
    v.literal("second"),
    v.literal("third"),
    v.literal("reply")
  ),
  speech_type: v.union(v.literal("substantive"), v.literal("reply")),
  style: v.number(),
  content: v.number(),
  strategy: v.number(),
  poi_modifier: v.optional(v.number()),
  comments: v.optional(v.string()),
  bias_detected: v.optional(v.boolean()),
  bias_explanation: v.optional(v.string()),
});

type IncomingSpeakerScore = {
  speaker_id: Id<"users">;
  team_id: Id<"teams">;
  position: "first" | "second" | "third" | "reply";
  speech_type: SpeechType;
  style: number;
  content: number;
  strategy: number;
  poi_modifier?: number;
  comments?: string;
  bias_detected?: boolean;
  bias_explanation?: string;
};

export const MIN_RFD_LENGTH = 40;

/**
 * Applies the WSDC rules to a whole ballot and returns the scored speakers.
 * Throws on the first violation with a message the judge can act on, so the
 * same rules hold whether the ballot came from a judge, an admin acting on
 * their behalf, or a queued offline submission.
 */
export function scoreBallot(input: {
  speaker_scores: IncomingSpeakerScore[];
  winning_team_id: Id<"teams">;
  rfd?: string;
  is_final_submission: boolean;
}) {
  const scored = input.speaker_scores.map((speaker) => {
    const issues = validateSpeechScore(speaker, speaker.speech_type);

    if (issues.length > 0) {
      throw new Error(issues[0].message);
    }

    return {
      ...speaker,
      total: speechTotal(speaker, speaker.speech_type),
    };
  });

  if (!input.is_final_submission) {
    return scored;
  }

  if (!input.rfd || input.rfd.trim().length < MIN_RFD_LENGTH) {
    throw new Error(
      `A reason for decision of at least ${MIN_RFD_LENGTH} characters is required before submitting.`
    );
  }

  const totalsByTeam = new Map<Id<"teams">, number>();
  scored.forEach((speaker) => {
    totalsByTeam.set(
      speaker.team_id,
      (totalsByTeam.get(speaker.team_id) ?? 0) + speaker.total
    );
  });

  if (totalsByTeam.size !== 2) {
    throw new Error("A ballot must score exactly two teams.");
  }

  const winnerTotal = totalsByTeam.get(input.winning_team_id);

  if (winnerTotal === undefined) {
    throw new Error("The winning team must be one of the teams scored.");
  }

  const loserTotal = Array.from(totalsByTeam.entries()).find(
    ([teamId]) => teamId !== input.winning_team_id
  )?.[1];

  if (loserTotal === undefined) {
    throw new Error("Could not determine the losing team's total.");
  }

  const outcome = validateOutcome(winnerTotal, loserTotal);

  if (!outcome.valid) {
    throw new Error(outcome.message);
  }

  return scored;
}
