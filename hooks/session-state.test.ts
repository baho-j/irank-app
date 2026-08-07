import { describe, expect, test } from "vitest";
import { isAuthenticated, isLoading, type SessionState } from "./session-state";

const base: SessionState = {
  token: null,
  user: null,
  sessionChecked: true,
  busy: false,
  hydrated: true,
};

const restored = (overrides: Partial<SessionState> = {}): SessionState => ({
  ...base,
  token: "token-from-local-storage",
  user: { id: "user_1" },
  ...overrides,
});

describe("a restored session is not trusted until the server confirms it", () => {
  test("a token from localStorage does not count as signed in on its own", () => {
    // The regression: feature hooks gated on `isAuthenticated` fired against a
    // token the server had already rejected, so the first sign of trouble was
    // an "Authentication required" error from whichever hook ran first.
    expect(isAuthenticated(restored({ sessionChecked: false }))).toBe(false);
  });

  test("an unchecked session still reads as loading", () => {
    expect(isLoading(restored({ sessionChecked: false }))).toBe(true);
  });

  test("it counts as signed in once the server has answered", () => {
    expect(isAuthenticated(restored())).toBe(true);
    expect(isLoading(restored())).toBe(false);
  });
});

describe("a visitor with no stored session", () => {
  test("is settled immediately rather than left loading", () => {
    expect(isLoading(base)).toBe(false);
    expect(isAuthenticated(base)).toBe(false);
  });
});

describe("the states callers must not confuse", () => {
  test("before hydration nothing is known, so it is loading not signed out", () => {
    expect(isLoading({ ...base, hydrated: false })).toBe(true);
  });

  test("a sign-in in flight is loading", () => {
    expect(isLoading({ ...base, busy: true })).toBe(true);
  });

  test("a token without a user is not authenticated", () => {
    expect(isAuthenticated(restored({ user: null }))).toBe(false);
  });
});
