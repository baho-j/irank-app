export type RoundStage = "prelim" | "elim";

export interface PairingTeam {
  team_id: string;
  name: string;
  school_id?: string;
  wins: number;
  total_points: number;
  /** Opponents already met at this tournament. */
  opponents_faced: string[];
  /** Opponents met at previous tournaments, most recent first. */
  prior_opponents: string[];
  side_history: Array<"proposition" | "opposition">;
  bye_rounds: number[];
}

export interface PairingJudge {
  judge_id: string;
  name: string;
  school_id?: string;
  /** Teams this judge may not see, from declared clashes. */
  conflicts: string[];
  debates_judged: number;
  elimination_debates: number;
  feedback_score: number;
}

export interface PairingRoom {
  name: string;
  capacity?: number;
}

export interface PairingInput {
  teams: PairingTeam[];
  judges: PairingJudge[];
  rooms: PairingRoom[];
  round_number: number;
  stage: RoundStage;
  judges_per_debate: number;
  /** Seeded so the same inputs always produce the same draw. */
  seed: number;
}

export interface PairedDebate {
  room_name: string;
  proposition_team_id: string | null;
  opposition_team_id: string | null;
  judges: string[];
  head_judge_id?: string;
  is_bye: boolean;
  /** Constraints this pairing had to violate, surfaced to the tab team. */
  compromises: string[];
}

export interface PairingResult {
  debates: PairedDebate[];
  /** Present when a team could not be placed at all, which must never happen. */
  unpaired: string[];
  warnings: string[];
}
