import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "../_generated/api";

/**
 * SMTP failures are usually transient — a dropped connection, a greylisting
 * deferral, a momentary DNS blip — so sends are retried with exponential
 * backoff rather than surfacing the first error to the caller.
 */
export const emailRetrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 1000,
  base: 2,
  maxFailures: 4,
});
