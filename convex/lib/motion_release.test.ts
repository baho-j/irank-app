import { describe, expect, test } from "vitest";
import { isMotionVisible, motionStatus, visibleMotion } from "./motion_release";
import { Doc } from "../_generated/dataModel";

const MOTION = "This house would abolish homework";

function round(overrides: Partial<Doc<"rounds">> = {}): Doc<"rounds"> {
  return {
    _id: "r1", _creationTime: 0,
    tournament_id: "t1", round_number: 1,
    type: "preliminary", status: "inProgress",
    start_time: 0, end_time: 0,
    motion: MOTION,
    is_impromptu: false,
    ...overrides,
  } as Doc<"rounds">;
}

const HOUR = 60 * 60 * 1000;

describe("prepared motions", () => {
  test.each(["student", "school_admin", "volunteer", "admin"])(
    "are visible to a %s",
    (role) => {
      expect(isMotionVisible(round(), role)).toBe(true);
      expect(visibleMotion(round(), role)).toBe(MOTION);
    }
  );

  test("report as prepared", () => {
    expect(motionStatus(round())).toBe("prepared");
  });
});

describe("impromptu motions before release", () => {
  const unreleased = round({ is_impromptu: true, motion_released_at: undefined });

  test.each(["student", "school_admin", "volunteer"])(
    "are hidden from a %s",
    (role) => {
      expect(isMotionVisible(unreleased, role)).toBe(false);
      expect(visibleMotion(unreleased, role)).toBe("");
    }
  );

  test("the motion text never reaches an unreleased viewer", () => {
    expect(visibleMotion(unreleased, "student")).not.toContain("homework");
  });

  test("an admin still sees it, since they set it", () => {
    expect(isMotionVisible(unreleased, "admin")).toBe(true);
    expect(visibleMotion(unreleased, "admin")).toBe(MOTION);
  });

  test("report as pending", () => {
    expect(motionStatus(unreleased)).toBe("pending");
  });
});

describe("scheduled release", () => {
  const scheduled = round({
    is_impromptu: true,
    motion_released_at: Date.now() + HOUR,
  });

  test("stays hidden until the moment arrives", () => {
    expect(isMotionVisible(scheduled, "volunteer")).toBe(false);
    expect(visibleMotion(scheduled, "student")).toBe("");
  });

  test("reports as scheduled rather than released", () => {
    expect(motionStatus(scheduled)).toBe("scheduled");
  });

  test("becomes visible once the time passes", () => {
    const released = round({
      is_impromptu: true,
      motion_released_at: Date.now() - 1000,
    });

    expect(isMotionVisible(released, "student")).toBe(true);
    expect(visibleMotion(released, "student")).toBe(MOTION);
    expect(motionStatus(released)).toBe("released");
  });

  test("releases to every role at the same moment", () => {
    const releaseAt = Date.now() - 1;
    const released = round({ is_impromptu: true, motion_released_at: releaseAt });

    const roles = ["student", "school_admin", "volunteer"];

    expect(roles.every((role) => isMotionVisible(released, role))).toBe(true);
  });

  test("a release exactly now is visible", () => {
    const now = Date.now();
    const released = round({ is_impromptu: true, motion_released_at: now });

    expect(isMotionVisible(released, "student")).toBe(true);
  });
});
