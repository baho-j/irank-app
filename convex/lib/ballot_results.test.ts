import { describe, expect, test } from "vitest";
import { resolvePanel } from "./ballot_results";
import { Id } from "../_generated/dataModel";

const prop = "prop_team" as Id<"teams">;
const opp = "opp_team" as Id<"teams">;
const chair = "chair" as Id<"users">;
const panelistA = "panelist_a" as Id<"users">;
const panelistB = "panelist_b" as Id<"users">;

const panelOf = (judges: Id<"users">[]) => ({
  judges,
  head_judge_id: chair,
  proposition_team_id: prop,
  opposition_team_id: opp,
});

const ballot = (
  judge_id: Id<"users">,
  winner: "proposition" | "opposition",
  propTotal = 210,
  oppTotal = 205
) => ({
  judge_id,
  winning_team_id: winner === "proposition" ? prop : opp,
  winning_position: winner,
  speaker_scores: [
    { team_id: prop, total: propTotal },
    { team_id: opp, total: oppTotal },
  ],
});

describe("panel reconciliation", () => {
  test("a solo judge decides the debate", () => {
    const outcome = resolvePanel([ballot(chair, "proposition")], panelOf([chair]));

    expect(outcome.decided).toBe(true);
    expect(outcome.winning_team_id).toBe(prop);
    expect(outcome.is_split).toBe(false);
  });

  test("a three-judge panel is NOT decided by the first ballot in", () => {
    const outcome = resolvePanel(
      [ballot(chair, "proposition")],
      panelOf([chair, panelistA, panelistB])
    );

    expect(outcome.decided).toBe(false);
    expect(outcome.winning_team_id).toBeUndefined();
  });

  test("a three-judge panel is not decided at two of three", () => {
    const outcome = resolvePanel(
      [ballot(chair, "proposition"), ballot(panelistA, "proposition")],
      panelOf([chair, panelistA, panelistB])
    );

    expect(outcome.decided).toBe(false);
  });

  test("resolves 2-1 to the majority once all judges submit", () => {
    const outcome = resolvePanel(
      [
        ballot(chair, "proposition"),
        ballot(panelistA, "opposition"),
        ballot(panelistB, "proposition"),
      ],
      panelOf([chair, panelistA, panelistB])
    );

    expect(outcome.decided).toBe(true);
    expect(outcome.winning_position).toBe("proposition");
    expect(outcome.proposition_votes).toBe(2);
    expect(outcome.opposition_votes).toBe(1);
  });

  test("flags a split rather than hiding it", () => {
    const outcome = resolvePanel(
      [
        ballot(chair, "proposition"),
        ballot(panelistA, "opposition"),
        ballot(panelistB, "proposition"),
      ],
      panelOf([chair, panelistA, panelistB])
    );

    expect(outcome.is_split).toBe(true);
  });

  test("a unanimous panel is not a split", () => {
    const outcome = resolvePanel(
      [
        ballot(chair, "opposition"),
        ballot(panelistA, "opposition"),
        ballot(panelistB, "opposition"),
      ],
      panelOf([chair, panelistA, panelistB])
    );

    expect(outcome.is_split).toBe(false);
    expect(outcome.winning_position).toBe("opposition");
  });

  test("an even panel tie is broken by the chair, never left undecided", () => {
    const outcome = resolvePanel(
      [ballot(chair, "opposition"), ballot(panelistA, "proposition")],
      panelOf([chair, panelistA])
    );

    expect(outcome.decided).toBe(true);
    expect(outcome.winning_position).toBe("opposition");
    expect(outcome.decided_by_chair).toBe(true);
    expect(outcome.is_split).toBe(true);
  });

  test("team points are averaged across judges", () => {
    const outcome = resolvePanel(
      [
        ballot(chair, "proposition", 210, 200),
        ballot(panelistA, "proposition", 220, 210),
      ],
      panelOf([chair, panelistA])
    );

    expect(outcome.team_points.get(prop)).toBe(215);
    expect(outcome.team_points.get(opp)).toBe(205);
  });

  test("no submissions leaves the debate undecided", () => {
    const outcome = resolvePanel([], panelOf([chair, panelistA]));

    expect(outcome.decided).toBe(false);
    expect(outcome.team_points.size).toBe(0);
  });

  test("an even panel tie with no chair ballot stays undecided rather than completing", () => {
    const outcome = resolvePanel(
      [ballot(panelistA, "proposition"), ballot(panelistB, "opposition")],
      { ...panelOf([panelistA, panelistB]), head_judge_id: chair }
    );

    expect(outcome.decided).toBe(false);
    expect(outcome.winning_team_id).toBeUndefined();
  });
});
