import type { Id } from "@/convex/_generated/dataModel";
import type { SpeakerPosition } from "./types";
import type { ArgumentFlowEntry, FactCheckEntry } from "./ballot-types";

export interface SubmittedSpeakerScore {
  speaker_id: Id<"users">;
  team_id: Id<"teams">;
  position: SpeakerPosition;
  speech_type: "substantive" | "reply";
  style: number;
  content: number;
  strategy: number;
  poi_modifier?: number;
  comments?: string;
  bias_detected?: boolean;
  bias_explanation?: string;
}

interface BaseSubmission {
  winning_team_id: Id<"teams">;
  winning_position: "proposition" | "opposition";
  speaker_scores: SubmittedSpeakerScore[];
  rfd?: string;
  notes?: string;
}

export interface VolunteerSubmission extends BaseSubmission {
  type: "volunteer_submit";
  token: string;
  debate_id: Id<"debates">;
  is_final_submission: boolean;
  fact_checks?: FactCheckEntry[];
  argument_flow?: ArgumentFlowEntry[];
}

export interface AdminSubmission extends BaseSubmission {
  type: "admin_submit";
  token: string;
  debate_id: Id<"debates">;
  judge_id: Id<"users">;
  is_final_submission: boolean;
}

/**
 * A coordinator correcting a submitted ballot. The reason is required because
 * the mutation records it alongside the previous scores in ballot_edits.
 */
export interface AdminCorrection {
  type: "admin_update";
  ballot_id: Id<"judging_scores">;
  reason: string;
  updates: Partial<BaseSubmission>;
}

export type BallotSubmission =
  | VolunteerSubmission
  | AdminSubmission
  | AdminCorrection;
