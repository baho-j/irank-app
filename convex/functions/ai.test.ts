import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers";

const AI_ACTIONS = [
  ["validateFeedback", { content: "Good speech." }],
  ["factCheckClaim", { claim: "Rwanda is in East Africa." }],
  ["checkBias", { content: "Good speech.", content_type: "comment" as const }],
] as const;

describe("ai action authorization", () => {
  describe.each(AI_ACTIONS)("%s", (actionName, args) => {
    test("rejects an unauthenticated call", async () => {
      const t = setupTest();

      await expect(
        t.action(api.functions.ai[actionName], { token: "not-a-real-token", ...args } as any)
      ).rejects.toThrow(/authentication required/i);
    });

    test("rejects an expired session", async () => {
      const t = setupTest();
      const { token } = await createUserWithSession(t, "volunteer", {
        expires_at: Date.now() - 1000,
      });

      await expect(
        t.action(api.functions.ai[actionName], { token, ...args } as any)
      ).rejects.toThrow(/authentication required/i);
    });

    test("passes authorization for a valid session, then requires configuration", async () => {
      const t = setupTest();
      const { token } = await createUserWithSession(t, "volunteer");

      await expect(
        t.action(api.functions.ai[actionName], { token, ...args } as any)
      ).rejects.toThrow(/GEMINI_API_KEY is not configured/i);
    });
  });
});
