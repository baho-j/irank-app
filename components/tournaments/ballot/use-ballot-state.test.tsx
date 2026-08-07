import { describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBallotState } from "./use-ballot-state";
import { EMPTY_SCORE, type BallotSpeaker } from "./types";

const PROP = { id: "prop", name: "Prop Team" };
const OPP = { id: "opp", name: "Opp Team" };

const VALID_RFD =
  "The proposition won the central clash on economic harm with clearer weighing.";

function speaker(
  id: string,
  team_id: string,
  position: BallotSpeaker["position"],
  speech_type: BallotSpeaker["speech_type"] = "substantive"
): BallotSpeaker {
  return {
    speaker_id: id,
    speaker_name: `Speaker ${id}`,
    team_id,
    position,
    speech_type,
    score: { ...EMPTY_SCORE },
  };
}

const roster = () => [
  speaker("p1", "prop", "first"),
  speaker("p2", "prop", "second"),
  speaker("o1", "opp", "first"),
  speaker("o2", "opp", "second"),
];

function setup(speakers = roster()) {
  return renderHook(() =>
    useBallotState({ speakers, propositionTeam: PROP, oppositionTeam: OPP })
  );
}

function scoreAll(
  result: { current: ReturnType<typeof useBallotState> },
  scores: Record<string, [number, number, number]>
) {
  act(() => {
    Object.entries(scores).forEach(([id, [style, content, strategy]]) => {
      result.current.updateScore(id, "style", style);
      result.current.updateScore(id, "content", content);
      result.current.updateScore(id, "strategy", strategy);
    });
  });
}

describe("useBallotState", () => {
  test("starts unable to submit with no scores", () => {
    const { result } = setup();

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.blockingReason).toMatch(/valid score/i);
  });

  test("reports team totals as scores are entered", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14],
      p2: [29, 28, 14],
      o1: [27, 27, 13],
      o2: [27, 27, 13],
    });

    expect(result.current.teams.proposition.total).toBe(141);
    expect(result.current.teams.opposition.total).toBe(134);
  });

  test("blocks submission until a winner is selected", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14], p2: [28, 28, 14],
      o1: [27, 27, 13], o2: [27, 27, 13],
    });

    expect(result.current.blockingReason).toMatch(/winning team/i);
  });

  test("blocks submission until the RFD is long enough", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14], p2: [28, 28, 14],
      o1: [27, 27, 13], o2: [27, 27, 13],
    });
    act(() => {
      result.current.setWinningTeamId("prop");
      result.current.setRfd("too short");
    });

    expect(result.current.blockingReason).toMatch(/reason for decision/i);
  });

  test("blocks a low-point win", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [26, 26, 12], p2: [26, 26, 12],
      o1: [30, 30, 15], o2: [30, 30, 15],
    });
    act(() => {
      result.current.setWinningTeamId("prop");
      result.current.setRfd(VALID_RFD);
    });

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.blockingReason).toMatch(/fewer total points/i);
  });

  test("blocks a draw", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14], p2: [28, 28, 14],
      o1: [28, 28, 14], o2: [28, 28, 14],
    });
    act(() => {
      result.current.setWinningTeamId("prop");
      result.current.setRfd(VALID_RFD);
    });

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.blockingReason).toMatch(/draws/i);
  });

  test("allows submission once everything is valid", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14], p2: [29, 28, 14],
      o1: [27, 27, 13], o2: [27, 27, 13],
    });
    act(() => {
      result.current.setWinningTeamId("prop");
      result.current.setRfd(VALID_RFD);
    });

    expect(result.current.canSubmit).toBe(true);
    expect(result.current.blockingReason).toBeNull();
  });

  test("rejects a non-half-mark score", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28.3, 28, 14], p2: [28, 28, 14],
      o1: [27, 27, 13], o2: [27, 27, 13],
    });

    expect(result.current.scoresComplete).toBe(false);
  });

  test("halves the reply speech band", () => {
    const { result } = setup([
      speaker("p1", "prop", "first"),
      speaker("p2", "prop", "reply", "reply"),
      speaker("o1", "opp", "first"),
      speaker("o2", "opp", "reply", "reply"),
    ]);

    scoreAll(result, {
      p1: [28, 28, 14],
      p2: [15, 14, 7],
      o1: [27, 27, 13],
      o2: [14, 14, 7],
    });

    expect(result.current.scoresComplete).toBe(true);
    expect(result.current.teams.proposition.total).toBe(70 + 36);
    expect(result.current.teams.opposition.total).toBe(67 + 35);
  });

  test("builds a submission payload in the mutation's shape", () => {
    const { result } = setup();

    scoreAll(result, {
      p1: [28, 28, 14], p2: [29, 28, 14],
      o1: [27, 27, 13], o2: [27, 27, 13],
    });
    act(() => {
      result.current.setWinningTeamId("opp");
      result.current.setRfd(VALID_RFD);
    });

    const payload = result.current.toSubmission();

    expect(payload.winning_position).toBe("opposition");
    expect(payload.speaker_scores).toHaveLength(4);
    expect(payload.speaker_scores[0]).toMatchObject({
      speaker_id: "p1",
      team_id: "prop",
      position: "first",
      speech_type: "substantive",
      style: 28,
      content: 28,
      strategy: 14,
    });
    expect(payload.rfd).toBe(VALID_RFD);
  });
});
