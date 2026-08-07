import { Doc } from "../_generated/dataModel";

/**
 * Whether a round's motion may be shown to this viewer.
 *
 * Prepared motions are visible once the tournament is running. Impromptu
 * motions stay hidden until the tab team releases them, which is the whole
 * point of an impromptu round — the deliverables require they not be visible
 * to any room or team before the release moment.
 *
 * Admins always see them, since they set them.
 */
export function isMotionVisible(round: Doc<"rounds">, role: string): boolean {
  if (role === "admin") return true;
  if (!round.is_impromptu) return true;

  return round.motion_released_at !== undefined && round.motion_released_at <= Date.now();
}

/** The motion, or a placeholder that says why it is not shown yet. */
export function visibleMotion(round: Doc<"rounds">, role: string): string {
  return isMotionVisible(round, role) ? round.motion : "";
}

export type MotionStatus = "prepared" | "scheduled" | "released" | "pending";

export function motionStatus(round: Doc<"rounds">): MotionStatus {
  if (!round.is_impromptu) return "prepared";
  if (!round.motion_released_at) return "pending";

  return round.motion_released_at <= Date.now() ? "released" : "scheduled";
}
