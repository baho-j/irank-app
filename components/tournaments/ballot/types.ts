import type { SpeechScore, SpeechType } from "@/lib/scoring/wsdc";

export const MIN_RFD_LENGTH = 40;

export type SpeakerPosition = "first" | "second" | "third" | "reply";

export interface BallotSpeaker {
  speaker_id: string;
  speaker_name: string;
  team_id: string;
  position: SpeakerPosition;
  speech_type: SpeechType;
  score: SpeechScore;
  comments?: string;
}

export interface BallotTeam {
  id: string;
  name: string;
  side: "proposition" | "opposition";
  total: number;
}

export type SubmissionState = "not_started" | "in_progress" | "submitted";

export const EMPTY_SCORE: SpeechScore = {
  style: Number.NaN,
  content: Number.NaN,
  strategy: Number.NaN,
  poi_modifier: 0,
};
