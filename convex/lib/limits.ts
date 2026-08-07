import { MINUTE, HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * Rate limits on the endpoints an anonymous caller can reach.
 *
 * These are public mutations, so anyone can call them in a loop from a browser
 * console. Without a limit that means unbounded outbound mail, unbounded
 * password guessing, and unbounded spend on a metered API.
 *
 * Most are keyed per email or per user rather than globally, so one person
 * hammering an endpoint cannot lock everybody else out. Where a global cap
 * also exists it is a backstop against a distributed attempt, set well above
 * what real use looks like.
 */
export const limiter = new RateLimiter(components.rateLimiter, {
  // Magic links and password resets share one mutation, so this covers both.
  // A person asking for a sign-in link twice is normal; twenty times is not.
  magicLinkPerEmail: {
    kind: "token bucket",
    rate: 5,
    period: HOUR,
    capacity: 2,
  },

  // Backstop against many addresses being tried from one script.
  magicLinkGlobal: {
    kind: "token bucket",
    rate: 200,
    period: HOUR,
    capacity: 50,
  },

  // Password guessing. The account lockout already counts failures per user;
  // this stops the attempt before it reaches the hashing work.
  signInPerEmail: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 5,
  },

  signInGlobal: {
    kind: "token bucket",
    rate: 500,
    period: MINUTE,
    capacity: 100,
  },

  // Registration. Real people sign up once; a script does not.
  signUpGlobal: {
    kind: "token bucket",
    rate: 60,
    period: HOUR,
    capacity: 20,
  },

  // Redeeming a reset token. Guessing one is infeasible, but there is no
  // reason to allow the attempt at speed.
  passwordResetPerUser: {
    kind: "token bucket",
    rate: 5,
    period: HOUR,
    capacity: 3,
  },

  // Tokens that fail to verify cannot be keyed per user — the caller chose the
  // token, so keying on it would give every guess its own fresh budget. These
  // share one bucket instead.
  passwordResetUnverified: {
    kind: "token bucket",
    rate: 20,
    period: HOUR,
    capacity: 10,
  },

  // Gemini is billed per call. The cache absorbs repeats of the same content;
  // this bounds a judge — or a script holding a judge's session — generating
  // fresh content in a loop.
  aiPerUser: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 10,
  },

  aiGlobal: {
    kind: "token bucket",
    rate: 600,
    period: MINUTE,
    capacity: 100,
  },
});

/**
 * How long to wait, in words a person can act on. The component reports
 * milliseconds; a toast saying "try again in 900000ms" helps nobody.
 */
export function retryMessage(retryAfter: number): string {
  const seconds = Math.ceil(retryAfter / 1000);

  if (seconds < 60) return `Please try again in ${seconds} seconds.`;

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) return `Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

  const hours = Math.ceil(minutes / 60);

  return `Please try again in ${hours} hour${hours === 1 ? "" : "s"}.`;
}
