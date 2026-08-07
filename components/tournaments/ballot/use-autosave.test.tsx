import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutosave } from "./use-autosave";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(onSave = vi.fn().mockResolvedValue(undefined)) {
  const { result, rerender } = renderHook(
    ({ value }: { value: Record<string, unknown> }) =>
      useAutosave({ value, onSave, delayMs: 1000 }),
    { initialProps: { value: { score: 0 } } }
  );

  return { result, rerender, onSave };
}

describe("useAutosave", () => {
  test("does not save on first render", async () => {
    const { onSave } = setup();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  test("saves after the judge stops editing", async () => {
    const { result, rerender, onSave } = setup();

    rerender({ value: { score: 28 } });
    expect(result.current.status).toBe("pending");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSave).toHaveBeenCalledWith({ score: 28 });
    expect(result.current.status).toBe("saved");
  });

  test("debounces rapid edits into one save", async () => {
    const { rerender, onSave } = setup();

    rerender({ value: { score: 1 } });
    await act(async () => { vi.advanceTimersByTime(400); });
    rerender({ value: { score: 2 } });
    await act(async () => { vi.advanceTimersByTime(400); });
    rerender({ value: { score: 3 } });

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ score: 3 });
  });

  test("does not save again when nothing changed", async () => {
    const { rerender, onSave } = setup();

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test("reports an error without losing the pending state", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    const { result, rerender } = setup(onSave);

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(result.current.status).toBe("error");
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  test("retries a failed save on the next edit", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(onSave);

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.status).toBe("error");

    rerender({ value: { score: 29 } });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(result.current.status).toBe("saved");
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  test("records when the draft was last saved", async () => {
    const { result, rerender } = setup();

    expect(result.current.lastSavedAt).toBeNull();

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(result.current.lastSavedAt).toBeTypeOf("number");
  });

  test("stays idle when disabled", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: Record<string, unknown> }) =>
        useAutosave({ value, onSave, delayMs: 1000, enabled: false }),
      { initialProps: { value: { score: 0 } } }
    );

    rerender({ value: { score: 28 } });
    await act(async () => { vi.advanceTimersByTime(5000); });

    expect(onSave).not.toHaveBeenCalled();
  });
});
