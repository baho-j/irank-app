import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { SpeechScore } from "@/lib/scoring/wsdc";
import type { SpeakerPosition, SubmissionState } from "./types";

export type UserRole = "student" | "school_admin" | "volunteer" | "admin";

export interface BallotJudge extends Partial<Doc<"users">> {
  _id?: Id<"users">;
  has_submitted?: boolean;
  is_final?: boolean;
  is_head_judge?: boolean;
  is_flagged?: boolean;
}

export interface BallotTeamRef {
  _id: Id<"teams">;
  name: string;
  members: Id<"users">[];
  school_id?: Id<"schools">;
  school?: { _id: Id<"schools">; name: string } | null;
}

export interface SpeakerScoreRecord {
  speaker_id: Id<"users">;
  team_id: Id<"teams">;
  position: SpeakerPosition;
  speech_type: "substantive" | "reply";
  style: number;
  content: number;
  strategy: number;
  poi_modifier?: number;
  total: number;
  comments?: string;
  bias_detected?: boolean;
  bias_explanation?: string;
}

export interface BallotRecord {
  _id: Id<"judging_scores">;
  judge_id: Id<"users">;
  winning_team_id?: Id<"teams">;
  winning_position?: "proposition" | "opposition";
  speaker_scores: SpeakerScoreRecord[];
  rfd?: string;
  notes?: string;
  submission_state: SubmissionState;
  flagged?: boolean;
  flag_reason?: string;
  submitted_at?: number;
}

export interface ArgumentFlowEntry {
  type: "main" | "rebuttal" | "poi";
  content: string;
  speaker: Id<"users">;
  team: Id<"teams">;
  timestamp: number;
  rebutted_by?: string[];
  strength?: number;
}

export interface FactCheckEntry {
  claim: string;
  result: "true" | "false" | "partially_true" | "inconclusive";
  sources?: string[];
  checked_by: Id<"users">;
  timestamp: number;
  explanation?: string;
}

export interface SharedNoteEntry {
  content: string;
  author: Id<"users">;
  timestamp: number;
  visibility: "private" | "judges" | "all";
}

/**
 * A debate as the ballot screens receive it: the stored document plus the
 * related records the queries join in.
 */
export interface EnrichedDebate {
  _id: Id<"debates">;
  round_id: Id<"rounds">;
  tournament_id: Id<"tournaments">;
  room_name?: string;
  status: "pending" | "inProgress" | "completed" | "noShow";
  judges: Id<"users">[] | BallotJudge[];
  head_judge_id?: Id<"users">;
  is_public_speaking: boolean;
  proposition_team_id?: Id<"teams">;
  opposition_team_id?: Id<"teams">;
  proposition_team?: BallotTeamRef | null;
  opposition_team?: BallotTeamRef | null;
  winning_team_id?: Id<"teams">;
  recording?: Id<"_storage">;
  recording_duration?: number;
  start_time?: number;
  current_speaker?: Id<"users">;
  current_position?: string;
  time_remaining?: number;
  round?: Doc<"rounds"> | null;
  my_submission?: BallotRecord | null;
  judges_ballots?: Array<{ judge_id: Id<"users">; ballot: BallotRecord | null }>;
  submissions_count?: number;
  final_submissions_count?: number;
  completion_percentage?: number;
  has_flagged_ballots?: boolean;
  can_see_full_details?: boolean;
  argument_flow?: ArgumentFlowEntry[];
  fact_checks?: FactCheckEntry[];
  shared_notes?: SharedNoteEntry[];
}

export interface BallotTournament {
  _id: Id<"tournaments">;
  name: string;
  format: string;
  team_size: number;
  prelim_rounds: number;
  elimination_rounds: number;
  speaking_times?: Record<string, number>;
  league_id?: Id<"leagues">;
}

export type ScoresBySpeaker = Record<string, SpeechScore>;
export type PositionsBySpeaker = Record<string, SpeakerPosition>;
