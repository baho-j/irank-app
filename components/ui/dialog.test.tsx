import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

/**
 * Call sites set desktop widths — the ballot uses `max-w-6xl`, pairing
 * `max-w-4xl` — so the mobile treatment has to survive those overrides rather
 * than be defeated by them.
 */
function renderDialog(className?: string) {
  return render(
    <Dialog open>
      <DialogContent className={className}>
        <DialogTitle>Ballot</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

const content = () => screen.getByRole("dialog");

describe("dialogs on a phone", () => {
  test("go edge to edge and full height below sm", () => {
    renderDialog();

    for (const rule of [
      "max-sm:inset-0",
      "max-sm:h-dvh",
      "max-sm:w-screen",
      "max-sm:max-w-none",
      "max-sm:rounded-none",
    ]) {
      expect(content().className).toContain(rule);
    }
  });

  test("scroll internally rather than clipping a long form", () => {
    renderDialog();

    expect(content().className).toContain("max-sm:overflow-y-auto");
  });

  test("drop the centring transform that would offset a full-screen sheet", () => {
    renderDialog();

    expect(content().className).toContain("max-sm:translate-x-0");
    expect(content().className).toContain("max-sm:translate-y-0");
  });

  test("use tighter padding, leaving more of a 360px screen for content", () => {
    renderDialog();

    expect(content().className).toContain("p-4");
    expect(content().className).toContain("sm:p-6");
  });

  test("a fixed viewport height from a call site is lifted", () => {
    renderDialog("max-h-[90vh]");

    // Several dialogs cap their height; on a full-screen sheet that would
    // leave dead space below the content.
    expect(content().className).toContain("max-sm:max-h-none");
  });

  test("a desktop width from a call site does not defeat the mobile size", () => {
    renderDialog("max-w-6xl");

    // Both are present; max-sm:max-w-none is the narrower media query, so it
    // wins below 640px and the desktop width applies above it.
    expect(content().className).toContain("max-w-6xl");
    expect(content().className).toContain("max-sm:max-w-none");
  });

  test("the desktop presentation is unchanged", () => {
    renderDialog();

    expect(content().className).toContain("sm:max-w-lg");
    expect(content().className).toContain("sm:rounded-lg");
  });
});

describe("the close control", () => {
  test("meets the minimum tap target on a phone", () => {
    renderDialog();

    expect(screen.getByText("Close").closest("button")!.className).toContain("size-11");
  });

  test("returns to its compact size on desktop", () => {
    renderDialog();

    expect(screen.getByText("Close").closest("button")!.className).toContain("sm:size-6");
  });
});
