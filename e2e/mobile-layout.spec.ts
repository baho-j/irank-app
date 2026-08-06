import { expect, test, type Page } from "@playwright/test";

/**
 * The acceptance criteria from `specs/06-mobile.md` that a browser can check.
 *
 * These cover the routes reachable without a session. Screens behind a login —
 * the ballot, the draw, standings — need seeded data and are verified by the
 * component tests plus a manual pass on a real device, which is what the spec
 * asks for anyway.
 */
const PUBLIC_ROUTES = [
  { path: "/", name: "landing" },
  { path: "/signin/student", name: "sign in" },
  { path: "/signup/student", name: "student sign up" },
  { path: "/signup/school_admin", name: "school sign up" },
  { path: "/signup/volunteer", name: "volunteer sign up" },
  { path: "/forgot-password", name: "forgot password" },
  { path: "/terms", name: "terms" },
];

/** How far the page can be scrolled sideways. Zero means nothing overflows. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** Elements wider than the viewport, which are what cause that overflow. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders: string[] = [];

    for (const element of Array.from(document.querySelectorAll("*"))) {
      const box = element.getBoundingClientRect();

      // Ignore anything deliberately positioned off-screen, such as a closed
      // drawer or a screen-reader-only label.
      if (box.width === 0 || box.left < -viewport) continue;

      if (box.width > viewport + 1) {
        const tag = element.tagName.toLowerCase();
        const cls = (element.getAttribute("class") ?? "").slice(0, 80);
        offenders.push(`${tag}.${cls} (${Math.round(box.width)}px)`);
      }
    }

    return offenders.slice(0, 5);
  });
}

test.describe("no horizontal scroll at 360px", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} fits the viewport`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");

      const overflow = await horizontalOverflow(page);

      if (overflow > 0) {
        const offenders = await overflowingElements(page);
        throw new Error(
          `${route.path} scrolls ${overflow}px sideways. Widest elements: ${offenders.join(", ")}`
        );
      }

      expect(overflow).toBe(0);
    });
  }
});

test.describe("tap targets", () => {
  // Controls are deliberately compact above `sm`, where a pointer is precise.
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 640, "phone widths only");

  test("interactive controls on the sign-in page are large enough to hit", async ({ page }) => {
    await page.goto("/signin/student");
    await page.waitForLoadState("networkidle");

    const small = await page.evaluate(() => {
      const MINIMUM = 40;
      const tooSmall: string[] = [];

      const controls = document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, [role="button"], [role="tab"]'
      );

      for (const control of Array.from(controls)) {
        const box = control.getBoundingClientRect();

        // Hidden controls have no size to judge.
        if (box.width === 0 || box.height === 0) continue;

        // A checkbox stays visually small but extends its hit area with a
        // pseudo-element, which getBoundingClientRect does not include.
        if (getComputedStyle(control, "::before").content !== "none") continue;

        // Radix renders a transparent proxy input behind its styled control
        // for form submission; the user never taps it directly.
        const style = getComputedStyle(control);
        if (style.opacity === "0" || style.position === "absolute") continue;

        if (box.height < MINIMUM) {
          const label = control.textContent?.trim().slice(0, 30) || control.tagName;
          tooSmall.push(`${label} (${Math.round(box.height)}px tall)`);
        }
      }

      return tooSmall;
    });

    expect(small, `Controls below the minimum tap height: ${small.join(", ")}`).toEqual([]);
  });
});

test.describe("the page is readable, not just present", () => {
  test("the sign-in form is usable without zooming", async ({ page }) => {
    await page.goto("/signin/student");
    await page.waitForLoadState("networkidle");

    const tiny = await page.evaluate(() => {
      const offenders: string[] = [];

      for (const element of Array.from(document.querySelectorAll("p, label, span, button"))) {
        const text = element.textContent?.trim();
        if (!text || text.length < 8) continue;

        const box = element.getBoundingClientRect();
        if (box.width === 0) continue;

        const size = parseFloat(getComputedStyle(element).fontSize);

        // Below 11px is uncomfortable on a phone held at arm's length.
        if (size < 11) offenders.push(`"${text.slice(0, 30)}" at ${size}px`);
      }

      return offenders.slice(0, 5);
    });

    expect(tiny, `Text too small to read: ${tiny.join(", ")}`).toEqual([]);
  });
});
