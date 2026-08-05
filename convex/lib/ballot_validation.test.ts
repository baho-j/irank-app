import { describe, expect, test } from "vitest";
import { scoreBallot } from "./ballot_validation";
import { Id } from "../_generated/dataModel";

const PROP = "prop" as Id<"teams">;
const OPP = "opp" as Id<"teams">;

const RFD =
  "The proposition won the central clash on economic harm with clearer weighing.";

type Position = "first" | "second" | "third" | "reply";

function speech(
  team_id: Id<"teams">,
  position: Position,
  style: number,
  content: number,
  strategy: number,
  speech_type: "substantive" | "reply" = "substantive"
) {
  return {
    speaker_id: `${team_id}-${position}` as Id<"users">,
    team_id,
    position,
    speech_type,
    style,
    content,
    strategy,
  };
}

const threeEach = () => [
  speech(PROP, "first", 29, 29, 15),
  speech(PROP, "second", 29, 29, 15),
  speech(PROP, "third", 29, 29, 15),
  speech(OPP, "first", 27, 27, 13),
  speech(OPP, "second", 27, 27, 13),
  speech(OPP, "third", 27, 27, 13),
];

const submit = (overrides: Partial<Parameters<typeof scoreBallot>[0]> = {}) =>
  scoreBallot({
    speaker_scores: threeEach(),
    winning_team_id: PROP,
    rfd: RFD,
    is_final_submission: true,
    ...overrides,
  });

describe("scoreBallot", () => {
  test("accepts a complete valid ballot", () => {
    const scored = submit();

    expect(scored).toHaveLength(6);
    expect(scored[0].total).toBe(73);
  });

  test("rejects a low-point win", () => {
    expect(() => submit({ winning_team_id: OPP })).toThrow(/fewer total points/i);
  });

  test("rejects a missing RFD", () => {
    expect(() => submit({ rfd: undefined })).toThrow(/reason for decision/i);
  });

  test("rejects an RFD that is too short", () => {
    expect(() => submit({ rfd: "they won" })).toThrow(/reason for decision/i);
  });

  test("allows a draft without an RFD", () => {
    expect(() => submit({ rfd: undefined, is_final_submission: false })).not.toThrow();
  });

  test("rejects an out-of-range score", () => {
    const scores = threeEach();
    scores[0].style = 40;

    expect(() => submit({ speaker_scores: scores })).toThrow(/between 24 and 32/i);
  });

  test("rejects a non-half-mark score", () => {
    const scores = threeEach();
    scores[0].content = 28.3;

    expect(() => submit({ speaker_scores: scores })).toThrow(/half-mark/i);
  });

  test("rejects a duplicate speaking position within a team", () => {
    const scores = threeEach();
    scores[1].position = "first";

    expect(() => submit({ speaker_scores: scores })).toThrow(/position may only be scored once/i);
  });

  test("rejects a team with the wrong number of substantive speeches", () => {
    const scores = threeEach().filter((_, index) => index !== 2);

    expect(() => submit({ speaker_scores: scores, team_size: 3 })).toThrow(
      /exactly 3 substantive speeches/i
    );
  });

  test("accepts the correct speech count when team_size is enforced", () => {
    expect(() => submit({ team_size: 3 })).not.toThrow();
  });

  test("counts reply speeches separately from the substantive requirement", () => {
    const scores = [
      ...threeEach(),
      speech(PROP, "reply", 15, 15, 7, "reply"),
      speech(OPP, "reply", 14, 14, 7, "reply"),
    ];

    expect(() => submit({ speaker_scores: scores, team_size: 3 })).not.toThrow();
  });

  test("rejects a ballot that does not score exactly two teams", () => {
    const scores = threeEach().filter((s) => s.team_id === PROP);

    expect(() => submit({ speaker_scores: scores })).toThrow(/exactly two teams/i);
  });
});
