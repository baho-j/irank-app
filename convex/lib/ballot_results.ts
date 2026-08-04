import { Id } from "../_generated/dataModel";

type Submission = {
  judge_id: Id<"users">;
  winning_team_id?: Id<"teams">;
  winning_position?: "proposition" | "opposition";
  speaker_scores: Array<{ team_id: Id<"teams">; total: number }>;
};

export type PanelOutcome = {
  decided: boolean;
  winning_team_id?: Id<"teams">;
  winning_position?: "proposition" | "opposition";
  proposition_votes: number;
  opposition_votes: number;
  is_split: boolean;
  decided_by_chair: boolean;
  team_points: Map<Id<"teams">, number>;
};

/**
 * Resolves a panel to a single result.
 *
 * A debate is only decided once every assigned judge has submitted, so a
 * three-judge panel is never settled by whichever ballot arrives first. Ties
 * on an even panel fall to the chair rather than being left undecided, and a
 * split is reported so the tab team can review it instead of it vanishing
 * into the average.
 */
export function resolvePanel(
  submissions: Submission[],
  panel: {
    judges: Id<"users">[];
    head_judge_id?: Id<"users">;
    proposition_team_id?: Id<"teams">;
    opposition_team_id?: Id<"teams">;
  }
): PanelOutcome {
  const teamPoints = new Map<Id<"teams">, number>();

  const empty: PanelOutcome = {
    decided: false,
    proposition_votes: 0,
    opposition_votes: 0,
    is_split: false,
    decided_by_chair: false,
    team_points: teamPoints,
  };

  if (submissions.length === 0) return empty;

  const propositionVotes = submissions.filter(
    (s) => s.winning_position === "proposition"
  ).length;
  const oppositionVotes = submissions.filter(
    (s) => s.winning_position === "opposition"
  ).length;

  const totals = new Map<Id<"teams">, number>();
  submissions.forEach((submission) => {
    submission.speaker_scores.forEach((speaker) => {
      totals.set(
        speaker.team_id,
        (totals.get(speaker.team_id) ?? 0) + speaker.total
      );
    });
  });
  totals.forEach((total, teamId) => {
    teamPoints.set(teamId, total / submissions.length);
  });

  const isSplit = propositionVotes > 0 && oppositionVotes > 0;
  const allJudgesSubmitted = submissions.length >= panel.judges.length;

  if (!allJudgesSubmitted) {
    return {
      ...empty,
      proposition_votes: propositionVotes,
      opposition_votes: oppositionVotes,
      is_split: isSplit,
      team_points: teamPoints,
    };
  }

  let winningPosition: "proposition" | "opposition" | undefined;
  let decidedByChair = false;

  if (propositionVotes > oppositionVotes) {
    winningPosition = "proposition";
  } else if (oppositionVotes > propositionVotes) {
    winningPosition = "opposition";
  } else {
    const chairBallot = submissions.find(
      (s) => s.judge_id === panel.head_judge_id
    );

    if (chairBallot?.winning_position) {
      winningPosition = chairBallot.winning_position;
      decidedByChair = true;
    }
  }

  const winningTeamId =
    winningPosition === "proposition"
      ? panel.proposition_team_id
      : winningPosition === "opposition"
        ? panel.opposition_team_id
        : undefined;

  return {
    decided: winningPosition !== undefined && winningTeamId !== undefined,
    winning_team_id: winningTeamId,
    winning_position: winningPosition,
    proposition_votes: propositionVotes,
    opposition_votes: oppositionVotes,
    is_split: isSplit,
    decided_by_chair: decidedByChair,
    team_points: teamPoints,
  };
}
