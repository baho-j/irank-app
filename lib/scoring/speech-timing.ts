/**
 * World Schools speech timing. Points of Information may only be offered
 * between the first and last minute; those boundaries are the "protected"
 * time a judge needs signalled during the speech.
 */

export const PROTECTED_SECONDS = 60;

/** Speeches may run over by this much before the overrun is material. */
export const GRACE_SECONDS = 15;

export type TimerPhase =
  | "protected_open"
  | "open"
  | "protected_close"
  | "grace"
  | "overtime";

export interface TimingCue {
  phase: TimerPhase;
  label: string;
  /** Signals a judge would knock or bell for. */
  chime: boolean;
}

export function speechLengthSeconds(
  speakingTimes: Record<string, number> | undefined,
  position: "first" | "second" | "third" | "reply",
  fallbackMinutes = 8
): number {
  const key =
    position === "reply"
      ? "reply"
      : position === "first"
        ? "speaker1"
        : position === "second"
          ? "speaker2"
          : "speaker3";

  const minutes = speakingTimes?.[key] ?? fallbackMinutes;

  return Math.round(minutes * 60);
}

export function phaseAt(elapsedSeconds: number, lengthSeconds: number): TimerPhase {
  if (elapsedSeconds < PROTECTED_SECONDS) return "protected_open";
  if (elapsedSeconds < lengthSeconds - PROTECTED_SECONDS) return "open";
  if (elapsedSeconds < lengthSeconds) return "protected_close";
  if (elapsedSeconds < lengthSeconds + GRACE_SECONDS) return "grace";
  return "overtime";
}

const PHASE_LABELS: Record<TimerPhase, string> = {
  protected_open: "Protected — no POIs",
  open: "POIs allowed",
  protected_close: "Protected — no POIs",
  grace: "Time — finish up",
  overtime: "Over time",
};

/**
 * The seconds a judge expects to be signalled: the two protected boundaries,
 * time itself, and the end of grace.
 */
export function cueAt(
  elapsedSeconds: number,
  lengthSeconds: number
): TimingCue | null {
  const boundaries: Array<[number, TimerPhase]> = [
    [PROTECTED_SECONDS, "open"],
    [lengthSeconds - PROTECTED_SECONDS, "protected_close"],
    [lengthSeconds, "grace"],
    [lengthSeconds + GRACE_SECONDS, "overtime"],
  ];

  const hit = boundaries.find(([at]) => at === elapsedSeconds);

  if (!hit) return null;

  return {
    phase: hit[1],
    label: PHASE_LABELS[hit[1]],
    chime: true,
  };
}

export function phaseLabel(phase: TimerPhase): string {
  return PHASE_LABELS[phase];
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
