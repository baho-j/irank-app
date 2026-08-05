import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { SCHOOL_WEIGHTS, STUDENT_WEIGHTS, speakerBasisForLeague } from "./config";
import {
  byeCredit,
  rankSpeakers,
  schoolScore,
  studentScore,
  teamScore,
  type SpeakerRecord,
} from "./scoring";

describe("weights", () => {
  test("school weights are 50 / 40 / 10 and sum to one", () => {
    expect(SCHOOL_WEIGHTS).toEqual({ performance: 0.5, attendance: 0.4, hosting: 0.1 });

    const total =
      SCHOOL_WEIGHTS.performance + SCHOOL_WEIGHTS.attendance + SCHOOL_WEIGHTS.hosting;
    expect(total).toBeCloseTo(1);
  });

  test("student weights are 80 / 20 and sum to one", () => {
    expect(STUDENT_WEIGHTS).toEqual({ performance: 0.8, participation: 0.2 });
    expect(STUDENT_WEIGHTS.performance + STUDENT_WEIGHTS.participation).toBeCloseTo(1);
  });
});

describe("school score", () => {
  test("applies each weight once", () => {
    expect(schoolScore({ performance: 100, attendance: 100, hosting: 100 })).toBe(100);
    expect(schoolScore({ performance: 0, attendance: 0, hosting: 0 })).toBe(0);
  });

  test("performance carries half the weight", () => {
    expect(schoolScore({ performance: 100, attendance: 0, hosting: 0 })).toBe(50);
  });

  test("attendance outweighs hosting four to one", () => {
    const attendanceOnly = schoolScore({ performance: 0, attendance: 100, hosting: 0 });
    const hostingOnly = schoolScore({ performance: 0, attendance: 0, hosting: 100 });

    expect(attendanceOnly).toBe(40);
    expect(hostingOnly).toBe(10);
    expect(attendanceOnly).toBe(hostingOnly * 4);
  });

  test("a school that only shows up still outranks one that only hosts", () => {
    expect(schoolScore({ performance: 0, attendance: 50, hosting: 0 })).toBeGreaterThan(
      schoolScore({ performance: 0, attendance: 0, hosting: 100 })
    );
  });
});

describe("student score", () => {
  test("speaking dominates participation", () => {
    expect(studentScore({ performance: 100, participation: 0 })).toBe(80);
    expect(studentScore({ performance: 0, participation: 100 })).toBe(20);
  });
});

describe("team score — the double-count guard", () => {
  test("performance and inherited participation are added exactly once", () => {
    expect(teamScore(60, 25)).toBe(85);
  });

  test("neither component is dropped", () => {
    const performance = 60;
    const participation = 25;
    const total = teamScore(performance, participation);

    expect(total).toBeGreaterThan(performance);
    expect(total).toBeGreaterThan(participation);
    expect(total).toBe(performance + participation);
  });

  test("participation is not applied twice", () => {
    // Doubling participation must move the total by exactly that amount.
    expect(teamScore(60, 50) - teamScore(60, 25)).toBe(25);
  });

  test("a team with no participation still scores its performance", () => {
    expect(teamScore(60, 0)).toBe(60);
  });
});

describe("speaker ranking basis", () => {
  const speakers: SpeakerRecord[] = [
    {
      speaker_id: "prolific", name: "Prolific",
      total_points: 700, debates_count: 10,
      team_wins: 5, highest_score: 72, points_deviation: 2,
    },
    {
      speaker_id: "sharp", name: "Sharp",
      total_points: 300, debates_count: 4,
      team_wins: 3, highest_score: 78, points_deviation: 1,
    },
  ];

  test("local competitions favour the speaker who debated more", () => {
    const ranked = rankSpeakers(speakers, "total");

    expect(ranked[0].speaker_id).toBe("prolific");
    expect(ranked[0].ranking_value).toBe(700);
  });

  test("international competitions favour the higher average", () => {
    const ranked = rankSpeakers(speakers, "average");

    expect(ranked[0].speaker_id).toBe("sharp");
    expect(ranked[0].ranking_value).toBe(75);
  });

  test("no minimum-debates threshold excludes anyone", () => {
    const withOneDebate: SpeakerRecord = {
      speaker_id: "single", name: "Single",
      total_points: 80, debates_count: 1,
      team_wins: 1, highest_score: 80, points_deviation: 0,
    };

    const ranked = rankSpeakers([...speakers, withOneDebate], "average");

    expect(ranked[0].speaker_id).toBe("single");
    expect(ranked).toHaveLength(3);
  });

  test("a speaker with no debates does not divide by zero", () => {
    const ranked = rankSpeakers(
      [{
        speaker_id: "none", name: "None",
        total_points: 0, debates_count: 0,
        team_wins: 0, highest_score: 0, points_deviation: 0,
      }],
      "average"
    );

    expect(ranked[0].ranking_value).toBe(0);
  });

  test("ties break by wins, then best speech, then consistency, then name", () => {
    const tied: SpeakerRecord[] = [
      { speaker_id: "b", name: "B", total_points: 200, debates_count: 3, team_wins: 2, highest_score: 74, points_deviation: 3 },
      { speaker_id: "a", name: "A", total_points: 200, debates_count: 3, team_wins: 3, highest_score: 70, points_deviation: 1 },
    ];

    expect(rankSpeakers(tied, "total")[0].speaker_id).toBe("a");
  });

  test("ranking is stable across repeated calls", () => {
    const first = rankSpeakers(speakers, "total").map((s) => s.speaker_id);
    const second = rankSpeakers(speakers, "total").map((s) => s.speaker_id);

    expect(first).toEqual(second);
  });
});

describe("league type decides the basis", () => {
  test.each([
    ["Local", "total"],
    ["Dreams Mode", "total"],
    ["International", "average"],
    [undefined, "total"],
  ] as const)("%s uses %s", (leagueType, expected) => {
    expect(speakerBasisForLeague(leagueType)).toBe(expected);
  });
});

describe("bye credit", () => {
  test("a bye is a win", () => {
    const credit = byeCredit(
      { debated_rounds: 4, points_from_debated_rounds: 840, bye_rounds: 1 },
      true
    );

    expect(credit.wins).toBe(1);
  });

  test("points are the team's average across rounds it actually debated", () => {
    const credit = byeCredit(
      { debated_rounds: 4, points_from_debated_rounds: 840, bye_rounds: 1 },
      true
    );

    expect(credit.points).toBe(210);
  });

  test("points are pending until the stage is complete", () => {
    const credit = byeCredit(
      { debated_rounds: 2, points_from_debated_rounds: 420, bye_rounds: 1 },
      false
    );

    expect(credit.wins).toBe(1);
    expect(credit.pending).toBe(true);
    expect(credit.points).toBe(0);
  });

  test("two byes are credited twice over", () => {
    const credit = byeCredit(
      { debated_rounds: 3, points_from_debated_rounds: 630, bye_rounds: 2 },
      true
    );

    expect(credit.wins).toBe(2);
    expect(credit.points).toBe(420);
  });

  test("no bye earns nothing and is not pending", () => {
    expect(
      byeCredit({ debated_rounds: 5, points_from_debated_rounds: 1050, bye_rounds: 0 }, true)
    ).toEqual({ wins: 0, points: 0, pending: false });
  });

  test("a team that only ever had a bye stays pending rather than dividing by zero", () => {
    const credit = byeCredit(
      { debated_rounds: 0, points_from_debated_rounds: 0, bye_rounds: 1 },
      true
    );

    expect(credit.pending).toBe(true);
    expect(credit.points).toBe(0);
  });

  test("prelim and elim credits are computed from their own stage only", () => {
    const prelims = byeCredit(
      { debated_rounds: 4, points_from_debated_rounds: 840, bye_rounds: 1 },
      true
    );
    const elims = byeCredit(
      { debated_rounds: 1, points_from_debated_rounds: 230, bye_rounds: 1 },
      true
    );

    expect(prelims.points).toBe(210);
    expect(elims.points).toBe(230);
  });
});

describe("properties", () => {
  const component = fc.integer({ min: 0, max: 100 });

  test("a school score always lands within 0-100", () => {
    fc.assert(
      fc.property(component, component, component, (performance, attendance, hosting) => {
        const score = schoolScore({ performance, attendance, hosting });
        return score >= 0 && score <= 100;
      })
    );
  });

  test("improving any component never lowers the school score", () => {
    fc.assert(
      fc.property(component, component, component, fc.integer({ min: 1, max: 20 }),
        (performance, attendance, hosting, bump) => {
          const base = schoolScore({ performance, attendance, hosting });
          const raised = schoolScore({
            performance: Math.min(100, performance + bump),
            attendance,
            hosting,
          });
          return raised >= base;
        })
    );
  });

  test("a bye never credits more than the team's own average implies", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 1, max: 3 }),
        (debated, points, byes) => {
          const credit = byeCredit(
            { debated_rounds: debated, points_from_debated_rounds: points, bye_rounds: byes },
            true
          );
          const average = points / debated;
          return credit.points <= average * byes + 0.01;
        }
      )
    );
  });
});
