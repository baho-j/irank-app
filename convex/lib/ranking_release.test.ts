import { describe, expect, test } from "vitest";
import {
  countableForRole,
  isCountableBallot,
  isTournamentCountable,
} from "./ranking_release";
import { Doc } from "../_generated/dataModel";

function tournament(overrides: Partial<Doc<"tournaments">> = {}): Doc<"tournaments"> {
  return {
    _id: "t1", _creationTime: 0,
    name: "Test", slug: "test",
    start_date: 0, end_date: 0, is_virtual: false,
    format: "WorldSchools",
    prelim_rounds: 3, elimination_rounds: 1,
    judges_per_debate: 1, team_size: 3,
    speaking_times: {},
    status: "completed",
    created_at: 0,
    ranking_released: {
      prelims: { teams: false, schools: false, students: false, volunteers: false },
      full_tournament: { teams: true, schools: true, students: true, volunteers: true },
      visible_to_roles: ["student", "school_admin", "volunteer"],
    },
    ...overrides,
  } as Doc<"tournaments">;
}

describe("release gating", () => {
  test("a released, completed tournament counts", () => {
    expect(isTournamentCountable(tournament(), "students", "student")).toBe(true);
  });

  test("an unreleased tournament never counts", () => {
    expect(
      isTournamentCountable(tournament({ ranking_released: undefined }), "students", "student")
    ).toBe(false);
  });

  test.each(["draft", "published", "inProgress", "cancelled"] as const)(
    "a %s tournament never counts",
    (status) => {
      expect(isTournamentCountable(tournament({ status }), "students", "student")).toBe(false);
    }
  );

  test("releasing one entity does not release another", () => {
    const partial = tournament({
      ranking_released: {
        prelims: { teams: false, schools: false, students: false, volunteers: false },
        full_tournament: { teams: true, schools: false, students: false, volunteers: false },
        visible_to_roles: ["student", "school_admin"],
      },
    });

    expect(isTournamentCountable(partial, "teams", "school_admin")).toBe(true);
    expect(isTournamentCountable(partial, "students", "school_admin")).toBe(false);
    expect(isTournamentCountable(partial, "schools", "school_admin")).toBe(false);
  });

  test("a role outside visible_to_roles is excluded", () => {
    const restricted = tournament({
      ranking_released: {
        prelims: { teams: false, schools: false, students: false, volunteers: false },
        full_tournament: { teams: true, schools: true, students: true, volunteers: true },
        visible_to_roles: ["school_admin"],
      },
    });

    expect(isTournamentCountable(restricted, "students", "school_admin")).toBe(true);
    expect(isTournamentCountable(restricted, "students", "student")).toBe(false);
  });

  test("prelim and full-tournament scopes are independent", () => {
    const prelimsOnly = tournament({
      ranking_released: {
        prelims: { teams: true, schools: true, students: true, volunteers: true },
        full_tournament: { teams: false, schools: false, students: false, volunteers: false },
        visible_to_roles: ["student"],
      },
    });

    expect(isTournamentCountable(prelimsOnly, "students", "student", "prelims")).toBe(true);
    expect(isTournamentCountable(prelimsOnly, "students", "student", "full_tournament")).toBe(false);
  });
});

describe("admin bypass", () => {
  test("an admin sees a completed but unreleased tournament", () => {
    expect(
      countableForRole(tournament({ ranking_released: undefined }), "students", "admin")
    ).toBe(true);
  });

  test("an admin still does not see an unfinished tournament", () => {
    expect(countableForRole(tournament({ status: "inProgress" }), "students", "admin")).toBe(false);
  });

  test("a non-admin goes through the full gate", () => {
    expect(
      countableForRole(tournament({ ranking_released: undefined }), "students", "student")
    ).toBe(false);
  });
});

describe("ballot counting", () => {
  const ballot = (state: "not_started" | "in_progress" | "submitted") =>
    ({ submission_state: state }) as Doc<"judging_scores">;

  test("only submitted ballots count", () => {
    expect(isCountableBallot(ballot("submitted"))).toBe(true);
    expect(isCountableBallot(ballot("in_progress"))).toBe(false);
    expect(isCountableBallot(ballot("not_started"))).toBe(false);
  });
});
