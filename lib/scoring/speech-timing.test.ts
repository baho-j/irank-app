import { describe, expect, test } from "vitest";
import {
  GRACE_SECONDS,
  PROTECTED_SECONDS,
  cueAt,
  formatClock,
  phaseAt,
  speechLengthSeconds,
} from "./speech-timing";

const EIGHT_MINUTES = 8 * 60;

describe("speech length", () => {
  const times = { speaker1: 8, speaker2: 8, speaker3: 8, reply: 4 };

  test.each([
    ["first", 480],
    ["second", 480],
    ["third", 480],
    ["reply", 240],
  ] as const)("resolves %s to %s seconds", (position, expected) => {
    expect(speechLengthSeconds(times, position)).toBe(expected);
  });

  test("falls back when the tournament has no configured times", () => {
    expect(speechLengthSeconds(undefined, "first")).toBe(EIGHT_MINUTES);
  });

  test("honours a shorter configured speech", () => {
    expect(speechLengthSeconds({ speaker1: 5 }, "first")).toBe(300);
  });
});

describe("phases", () => {
  test("opens protected", () => {
    expect(phaseAt(0, EIGHT_MINUTES)).toBe("protected_open");
    expect(phaseAt(59, EIGHT_MINUTES)).toBe("protected_open");
  });

  test("opens to POIs after the first minute", () => {
    expect(phaseAt(PROTECTED_SECONDS, EIGHT_MINUTES)).toBe("open");
  });

  test("protects the final minute", () => {
    expect(phaseAt(EIGHT_MINUTES - PROTECTED_SECONDS, EIGHT_MINUTES)).toBe(
      "protected_close"
    );
    expect(phaseAt(EIGHT_MINUTES - 1, EIGHT_MINUTES)).toBe("protected_close");
  });

  test("enters grace at time", () => {
    expect(phaseAt(EIGHT_MINUTES, EIGHT_MINUTES)).toBe("grace");
  });

  test("is overtime once grace expires", () => {
    expect(phaseAt(EIGHT_MINUTES + GRACE_SECONDS, EIGHT_MINUTES)).toBe("overtime");
  });

  test("a short reply speech still has both protected windows", () => {
    const reply = 240;

    expect(phaseAt(30, reply)).toBe("protected_open");
    expect(phaseAt(120, reply)).toBe("open");
    expect(phaseAt(200, reply)).toBe("protected_close");
  });
});

describe("cues", () => {
  test("fires exactly on each boundary", () => {
    expect(cueAt(PROTECTED_SECONDS, EIGHT_MINUTES)?.phase).toBe("open");
    expect(cueAt(EIGHT_MINUTES - PROTECTED_SECONDS, EIGHT_MINUTES)?.phase).toBe(
      "protected_close"
    );
    expect(cueAt(EIGHT_MINUTES, EIGHT_MINUTES)?.phase).toBe("grace");
    expect(cueAt(EIGHT_MINUTES + GRACE_SECONDS, EIGHT_MINUTES)?.phase).toBe("overtime");
  });

  test("does not fire between boundaries", () => {
    expect(cueAt(30, EIGHT_MINUTES)).toBeNull();
    expect(cueAt(120, EIGHT_MINUTES)).toBeNull();
    expect(cueAt(EIGHT_MINUTES + 5, EIGHT_MINUTES)).toBeNull();
  });

  test("every cue is audible", () => {
    expect(cueAt(EIGHT_MINUTES, EIGHT_MINUTES)?.chime).toBe(true);
  });
});

describe("clock", () => {
  test.each([
    [0, "0:00"],
    [9, "0:09"],
    [60, "1:00"],
    [485, "8:05"],
  ])("formats %s as %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  test("never renders negative time", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});
