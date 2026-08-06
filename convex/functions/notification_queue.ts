import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { notificationPool } from "../lib/pools";

const messageValidator = v.object({
  to: v.string(),
  subject: v.string(),
  html: v.string(),
  text: v.optional(v.string()),
});

/**
 * Hands a batch of messages to the notification pool.
 *
 * Sending used to be a serial loop inside the calling action: a release to a
 * whole league was one long action against the mail provider's rate limit, and
 * the first hard failure lost every message after it. Enqueued, each message is
 * delivered and retried independently, a bounded number at a time.
 *
 * Enqueued as a batch rather than one call each, because every component call
 * runs in its own container and the per-call overhead adds up over a league.
 */
export const enqueueEmails = internalMutation({
  args: { messages: v.array(messageValidator) },
  handler: async (ctx, args): Promise<{ queued: number }> => {
    if (args.messages.length === 0) return { queued: 0 };

    await notificationPool.enqueueActionBatch(
      ctx,
      internal.functions.email.deliver,
      args.messages.map((message) => ({ ...message }))
    );

    return { queued: args.messages.length };
  },
});
