"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseAutosaveArgs<T> {
  value: T;
  onSave: (value: T) => Promise<void>;
  /** Quiet period after the last edit before saving. */
  delayMs?: number;
  enabled?: boolean;
}

/**
 * Saves a draft after the judge stops editing, so `in_progress` reflects real
 * activity instead of only being written when someone remembers to press a
 * button. The deliverables require that no manual save is needed at any point
 * during a debate.
 */
export function useAutosave<T>({
  value,
  onSave,
  delayMs = 1500,
  enabled = true,
}: UseAutosaveArgs<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const serialised = JSON.stringify(value);
  const lastSavedRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);

  useEffect(() => {
    onSaveRef.current = onSave;
    valueRef.current = value;
  }, [onSave, value]);

  const save = useCallback(async () => {
    setStatus("saving");

    try {
      await onSaveRef.current(valueRef.current);
      lastSavedRef.current = JSON.stringify(valueRef.current);
      setLastSavedAt(Date.now());
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Nothing has changed since the last successful save.
    if (lastSavedRef.current === serialised) return;

    // The first render establishes a baseline rather than saving immediately.
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialised;
      return;
    }

    setStatus("pending");
    const timeout = window.setTimeout(save, delayMs);

    return () => window.clearTimeout(timeout);
  }, [serialised, enabled, delayMs, save]);

  return {
    status,
    lastSavedAt,
    hasUnsavedChanges: status === "pending" || status === "error",
    saveNow: save,
  };
}
