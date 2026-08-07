import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { limiter, retryMessage } from "../lib/limits";

/**
 * Spends one unit of a user's assistant budget.
 *
 * Gemini is billed per call, and the assistant endpoints are reachable by
 * anyone holding a judge's session. The cache absorbs repeats of identical
 * content; this bounds fresh content.
 *
 * A mutation because rate limiting writes, and the assistant endpoints are
 * actions. It lives outside `ai.ts` because that file runs in the Node
 * runtime, which cannot define mutations.
 */
export const consumeAiBudget = internalMutation({
  args: { user_id: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; message?: string }> => {
    const perUser = await limiter.limit(ctx, "aiPerUser", { key: args.user_id });

    if (!perUser.ok) {
      return {
        ok: false,
        message: `Too many assistant requests. ${retryMessage(perUser.retryAfter ?? 0)}`,
      };
    }

    const overall = await limiter.limit(ctx, "aiGlobal");

    if (!overall.ok) {
      return {
        ok: false,
        message: `The assistant is busy. ${retryMessage(overall.retryAfter ?? 0)}`,
      };
    }

    return { ok: true };
  },
});
