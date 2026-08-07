import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";

/**
 * The Gemini calls are billed per request and judges re-run them as they edit,
 * so identical text must not be sent twice. These assert the cache is actually
 * consulted and, just as importantly, that it is keyed on the content rather
 * than on the session token.
 */
function stubGemini() {
  const calls: string[] = [];

  vi.stubGlobal("fetch", async (url: any, init: any) => {
    calls.push(String(url));

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ isAppropriate: true, confidence: 0.9 }) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  return calls;
}

describe("Gemini responses are cached", () => {
  test("the same content is only sent once", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");
    const calls = stubGemini();

    process.env.GEMINI_API_KEY = "test-key";

    const content = "The speaker structured their case clearly.";

    await t.action(api.functions.ai.validateFeedback, { token, content });
    await t.action(api.functions.ai.validateFeedback, { token, content });

    expect(calls).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  test("different content is sent again", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");
    const calls = stubGemini();

    process.env.GEMINI_API_KEY = "test-key";

    await t.action(api.functions.ai.validateFeedback, { token, content: "First." });
    await t.action(api.functions.ai.validateFeedback, { token, content: "Second." });

    expect(calls).toHaveLength(2);

    vi.unstubAllGlobals();
  });

  test("a second judge reuses the first judge's result", async () => {
    const t = setupTest();
    const first = await createUserWithSession(t, "volunteer");
    const second = await createUserWithSession(t, "volunteer");
    const calls = stubGemini();

    process.env.GEMINI_API_KEY = "test-key";

    const claim = "Rwanda joined the Commonwealth in 2009.";

    await t.action(api.functions.ai.factCheckClaim, { token: first.token, claim });
    await t.action(api.functions.ai.factCheckClaim, { token: second.token, claim });

    // Keyed on the claim, not the session: a panel checking the same claim
    // must not pay for it twice.
    expect(calls).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  test("caching does not bypass authentication", async () => {
    const t = setupTest();
    stubGemini();

    process.env.GEMINI_API_KEY = "test-key";

    await expect(
      t.action(api.functions.ai.validateFeedback, {
        token: "not-a-session",
        content: "anything",
      })
    ).rejects.toThrow(/authentication required/i);

    vi.unstubAllGlobals();
  });

  test("bias checks distinguish content type", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");
    const calls = stubGemini();

    process.env.GEMINI_API_KEY = "test-key";

    const content = "That was a weak argument.";

    await t.action(api.functions.ai.checkBias, {
      token, content, content_type: "feedback",
    });
    await t.action(api.functions.ai.checkBias, {
      token, content, content_type: "argument",
    });

    // Same text, different prompt — the two must not share a cache entry.
    expect(calls).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
