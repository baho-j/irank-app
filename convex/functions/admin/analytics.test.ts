import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import { createUserWithSession, setupTest } from "../../test_helpers.test-utils";

const ANALYTICS_QUERIES = [
  "getDashboardOverview",
  "getTournamentAnalytics",
  "getUserAnalytics",
  "getFinancialAnalytics",
  "getPerformanceAnalytics",
] as const;

describe("admin analytics authorization", () => {
  describe.each(ANALYTICS_QUERIES)("%s", (queryName) => {
    const analyticsQuery = () => api.functions.admin.analytics[queryName];

    test("rejects the literal \"shared\" token", async () => {
      const t = setupTest();

      await expect(
        t.query(analyticsQuery(), { token: "shared" })
      ).rejects.toThrow(/admin access required/i);
    });

    test("rejects an unknown token", async () => {
      const t = setupTest();

      await expect(
        t.query(analyticsQuery(), { token: "not-a-real-token" })
      ).rejects.toThrow(/admin access required/i);
    });

    test.each(["student", "school_admin", "volunteer"] as const)(
      "rejects a %s session",
      async (role) => {
        const t = setupTest();
        const { token } = await createUserWithSession(t, role);

        await expect(
          t.query(analyticsQuery(), { token })
        ).rejects.toThrow(/admin access required/i);
      }
    );

    test("rejects an expired admin session", async () => {
      const t = setupTest();
      const { token } = await createUserWithSession(t, "admin", {
        expires_at: Date.now() - 1000,
      });

      await expect(
        t.query(analyticsQuery(), { token })
      ).rejects.toThrow(/admin access required/i);
    });

    test("allows an admin session", async () => {
      const t = setupTest();
      const { token } = await createUserWithSession(t, "admin");

      await expect(
        t.query(analyticsQuery(), { token })
      ).resolves.toBeDefined();
    });
  });

  test("internal analytics queries are not exposed on the public api", () => {
    const publicNames = Object.keys(api.functions.admin.analytics);

    expect(publicNames).not.toContain("dashboardOverview");
    expect(publicNames).not.toContain("tournamentAnalytics");
    expect(publicNames).not.toContain("userAnalytics");
    expect(publicNames).not.toContain("financialAnalytics");
    expect(publicNames).not.toContain("performanceAnalytics");
  });
});
