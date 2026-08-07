import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  AVERAGE_SPEECH,
  averageFor,
  isHalfMark,
  marginBand,
  rangesFor,
  speechTotal,
  teamTotal,
  validateOutcome,
  validateSpeechScore,
  type SpeechScore,
} from "./wsdc";

const average: SpeechScore = { style: 28, content: 28, strategy: 14 };

describe("WSDC ranges", () => {
  test("an average substantive speech is 70 (28/28/14)", () => {
    expect(AVERAGE_SPEECH).toEqual({ style: 28, content: 28, strategy: 14, total: 70 });
    expect(speechTotal(average, "substantive")).toBe(70);
  });

  test("an average reply speech is 35 — exactly half", () => {
    const replyAverage = averageFor("reply");

    expect(replyAverage.total).toBe(35);
    expect(speechTotal(replyAverage, "reply")).toBe(35);
  });

  test("reply ranges are exactly half the substantive ranges", () => {
    const substantive = rangesFor("substantive");
    const reply = rangesFor("reply");

    (["style", "content", "strategy", "total"] as const).forEach((field) => {
      expect(reply[field].min).toBe(substantive[field].min / 2);
      expect(reply[field].max).toBe(substantive[field].max / 2);
    });
  });

  test("substantive totals span 60 to 80", () => {
    expect(speechTotal({ style: 24, content: 24, strategy: 12 }, "substantive")).toBe(60);
    expect(speechTotal({ style: 32, content: 32, strategy: 16 }, "substantive")).toBe(80);
  });
});

describe("half marks", () => {
  test.each([28, 28.5, 0, -2, 31.5])("accepts %s", (value) => {
    expect(isHalfMark(value)).toBe(true);
  });

  test.each([28.3, 28.25, 27.1, NaN, Infinity])("rejects %s", (value) => {
    expect(isHalfMark(value)).toBe(false);
  });

  test("a non-half-mark score is rejected with a field-specific message", () => {
    const issues = validateSpeechScore({ ...average, style: 28.3 }, "substantive");

    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("style");
    expect(issues[0].message).toMatch(/half-mark/i);
  });
});

describe("out-of-range scores", () => {
  test.each([
    ["style", 23.5],
    ["style", 32.5],
    ["content", 23.5],
    ["content", 32.5],
    ["strategy", 11.5],
    ["strategy", 16.5],
  ])("rejects %s = %s for a substantive speech", (field, value) => {
    const issues = validateSpeechScore({ ...average, [field]: value }, "substantive");

    expect(issues.map((issue) => issue.field)).toContain(field);
  });

  test("a substantive-range score is out of range for a reply", () => {
    const issues = validateSpeechScore(average, "reply");

    expect(issues.length).toBeGreaterThan(0);
  });

  test("a valid speech produces no issues", () => {
    expect(validateSpeechScore(average, "substantive")).toEqual([]);
    expect(validateSpeechScore({ style: 14, content: 14, strategy: 7 }, "reply")).toEqual([]);
  });
});

describe("points of information modifier", () => {
  test("applies within the band", () => {
    expect(speechTotal({ ...average, poi_modifier: 2 }, "substantive")).toBe(72);
    expect(speechTotal({ ...average, poi_modifier: -1.5 }, "substantive")).toBe(68.5);
  });

  test("never pushes the total above the maximum", () => {
    const top: SpeechScore = { style: 32, content: 32, strategy: 16, poi_modifier: 2 };

    expect(speechTotal(top, "substantive")).toBe(80);
  });

  test("never pushes the total below the minimum", () => {
    const bottom: SpeechScore = { style: 24, content: 24, strategy: 12, poi_modifier: -2 };

    expect(speechTotal(bottom, "substantive")).toBe(60);
  });

  test.each([2.5, -2.5, 3])("rejects a modifier of %s", (poi_modifier) => {
    const issues = validateSpeechScore({ ...average, poi_modifier }, "substantive");

    expect(issues.map((issue) => issue.field)).toContain("poi_modifier");
  });
});

describe("outcome validation", () => {
  test("rejects a draw", () => {
    const result = validateOutcome(210, 210);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("draw");
    expect(result.message).toMatch(/does not allow draws/i);
  });

  test("rejects a low-point win", () => {
    const result = validateOutcome(205, 210);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("low_point_win");
    expect(result.message).toMatch(/fewer total points/i);
  });

  test("accepts a win with a positive margin", () => {
    expect(validateOutcome(215, 210)).toEqual({ valid: true, margin: 5 });
  });
});

describe("margin bands", () => {
  test.each([
    [0, "very_close"],
    [2, "very_close"],
    [3, "close_but_clear"],
    [5, "close_but_clear"],
    [7, "clearly_better"],
    [10, "clearly_better"],
    [15, "dominated"],
    [20, "dominated"],
    [21, "shredded"],
    [40, "shredded"],
  ])("a margin of %s is %s", (margin, expected) => {
    expect(marginBand(margin)).toBe(expected);
  });
});

describe("team totals", () => {
  test("sums three substantive speeches and a reply", () => {
    const total = teamTotal([
      { score: average, speech_type: "substantive" },
      { score: average, speech_type: "substantive" },
      { score: average, speech_type: "substantive" },
      { score: { style: 14, content: 14, strategy: 7 }, speech_type: "reply" },
    ]);

    expect(total).toBe(70 * 3 + 35);
  });
});

describe("properties", () => {
  const halfMarkIn = (min: number, max: number) =>
    fc.integer({ min: min * 2, max: max * 2 }).map((n) => n / 2);

  const substantiveScore = fc.record({
    style: halfMarkIn(24, 32),
    content: halfMarkIn(24, 32),
    strategy: halfMarkIn(12, 16),
    poi_modifier: halfMarkIn(-2, 2),
  });

  test("any valid substantive speech totals within 60-80", () => {
    fc.assert(
      fc.property(substantiveScore, (score) => {
        const total = speechTotal(score, "substantive");
        return total >= 60 && total <= 80;
      })
    );
  });

  test("any valid substantive speech passes validation", () => {
    fc.assert(
      fc.property(substantiveScore, (score) => {
        return validateSpeechScore(score, "substantive").length === 0;
      })
    );
  });

  test("totals stay on half-mark boundaries", () => {
    fc.assert(
      fc.property(substantiveScore, (score) => {
        return isHalfMark(speechTotal(score, "substantive"));
      })
    );
  });

  test("a strictly higher-scoring team is never a low-point win", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 180, max: 240 }),
        fc.integer({ min: 1, max: 60 }),
        (loser, margin) => validateOutcome(loser + margin, loser).valid
      )
    );
  });
});

describe("regression: the pre-overhaul formula", () => {
  test("a bottom speech and a mid speech no longer collapse to the same score", () => {
    const bottom = speechTotal({ style: 24, content: 24, strategy: 12 }, "substantive");
    const mid = speechTotal({ style: 28, content: 26, strategy: 13 }, "substantive");

    expect(bottom).toBe(60);
    expect(mid).toBe(67);
    expect(bottom).not.toBe(mid);
  });

  test("no unconditional attendance bonus is added to any speech", () => {
    expect(speechTotal(average, "substantive")).toBe(70);
    expect(speechTotal({ style: 24, content: 24, strategy: 12 }, "substantive")).toBe(60);
  });

  test("scores are not rescaled into a 16.3-30 band", () => {
    const total = speechTotal(average, "substantive");

    expect(total).toBeGreaterThan(30);
    expect(total).toBe(70);
  });
});
