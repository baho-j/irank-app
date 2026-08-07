"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cueAt,
  formatClock,
  phaseAt,
  phaseLabel,
  speechLengthSeconds,
  type TimerPhase,
} from "@/lib/scoring/speech-timing";
import type { SpeakerPosition } from "./types";

/**
 * A short tone, synthesised rather than fetched, so the timer works in a venue
 * with no connectivity and needs no asset to be cached.
 */
function chime(times: number) {
  if (typeof window === "undefined") return;

  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) return;

  const context = new AudioCtx();

  for (let index = 0; index < times; index += 1) {
    const startAt = context.currentTime + index * 0.35;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.setValueAtTime(880, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.3);
  }

  window.setTimeout(() => context.close(), times * 400 + 500);
}

const CHIME_COUNT: Record<TimerPhase, number> = {
  protected_open: 0,
  open: 1,
  protected_close: 1,
  grace: 2,
  overtime: 3,
};

interface UseSpeechTimerArgs {
  speakingTimes?: Record<string, number>;
  position: SpeakerPosition;
  soundEnabled?: boolean;
}

export function useSpeechTimer({
  speakingTimes,
  position,
  soundEnabled = true,
}: UseSpeechTimerArgs) {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const lastCueRef = useRef(-1);

  const lengthSeconds = useMemo(
    () => speechLengthSeconds(speakingTimes, position),
    [speakingTimes, position]
  );

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setElapsed((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || elapsed === lastCueRef.current) return;

    const cue = cueAt(elapsed, lengthSeconds);

    if (cue) {
      lastCueRef.current = elapsed;
      if (soundEnabled && cue.chime) chime(CHIME_COUNT[cue.phase]);
    }
  }, [elapsed, isRunning, lengthSeconds, soundEnabled]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setElapsed(0);
    lastCueRef.current = -1;
  }, []);

  const phase = phaseAt(elapsed, lengthSeconds);

  return {
    elapsed,
    lengthSeconds,
    remaining: Math.max(0, lengthSeconds - elapsed),
    isRunning,
    phase,
    phaseLabel: phaseLabel(phase),
    isOvertime: phase === "overtime",
    display: formatClock(elapsed),
    remainingDisplay: formatClock(Math.max(0, lengthSeconds - elapsed)),
    progress: Math.min(100, (elapsed / lengthSeconds) * 100),
    start: () => setIsRunning(true),
    pause: () => setIsRunning(false),
    toggle: () => setIsRunning((running) => !running),
    reset,
  };
}
