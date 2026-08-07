import { Workpool } from "@convex-dev/workpool";
import { components } from "../_generated/api";

/**
 * Outbound notifications — email and push.
 *
 * Sends were previously a serial loop inside one action, so a ranking release
 * to every school and student was one long-running action against SMTP rate
 * limits, and a single failure lost the rest of the batch. The pool sends a
 * bounded number at a time and retries each message on its own.
 *
 * Parallelism is deliberately modest: the limit is the mail provider's, not
 * ours, and the same pool carries push, which the browser vendors also
 * throttle.
 */
export const notificationPool = new Workpool(components.notificationPool, {
  maxParallelism: 6,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 1000, base: 2 },
});

/**
 * Ranking and standings recomputation.
 *
 * Kept apart from notifications so a nightly snapshot rebuild cannot delay a
 * motion release, and narrow because each job writes to shared ranking rows —
 * running many at once would mostly produce write conflicts.
 */
export const rankingPool = new Workpool(components.rankingPool, {
  maxParallelism: 2,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
});
