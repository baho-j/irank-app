import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";

type T = ReturnType<typeof setupTest>;

const magicLink = (t: T, email: string) =>
  t.mutation(api.functions.auth.generateMagicLink, { email, purpose: "login" });

/**
 * Mirrors what the client does: count the attempt in its own mutation, then
 * try to sign in. The count has to be separate because a failed sign-in rolls
 * back its own writes, the limiter's included.
 */
const signIn = async (t: T, email: string, password: string) => {
  const allowed = await t.mutation(api.functions.auth.recordSignInAttempt, {
    identifier: email,
  });

  if (!allowed.ok) throw new Error(allowed.message);

  return t.mutation(api.functions.auth.signIn, {
    email,
    password,
    expected_role: "admin",
  });
};

/**
 * These endpoints are public, so anyone can call them in a loop from a browser
 * console. Without a limit that means unbounded outbound mail and unbounded
 * password guessing.
 */
describe("magic links are rate limited", () => {
  test("a burst from one address is cut off", async () => {
    const t = setupTest();

    // The bucket allows a small burst, then refuses.
    const outcomes: boolean[] = [];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      outcomes.push(
        await magicLink(t, "someone@example.test").then(
          () => true,
          () => false
        )
      );
    }

    expect(outcomes.some((ok) => ok)).toBe(true);
    expect(outcomes.some((ok) => !ok)).toBe(true);
  });

  test("the refusal says when to try again", async () => {
    const t = setupTest();

    let message = "";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await magicLink(t, "chatty@example.test");
      } catch (error: any) {
        message = error.message;
        break;
      }
    }

    expect(message).toMatch(/try again in/i);
  });

  test("one address being limited does not block another", async () => {
    const t = setupTest();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await magicLink(t, "noisy@example.test").catch(() => undefined);
    }

    // Keyed per address, so a different person is unaffected.
    await expect(magicLink(t, "quiet@example.test")).resolves.toMatchObject({
      success: true,
    });
  });
});

describe("the magic link reveals nothing about the address", () => {
  test("an unregistered address gets the same answer as a registered one", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "admin");

    const registered = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      return user!.email;
    });

    const known = await magicLink(t, registered);
    const unknown = await magicLink(t, "nobody-here@example.test");

    // Saying "user not found" would turn this into an oracle for testing
    // which addresses have accounts.
    expect(unknown.message).toBe(known.message);
    expect(unknown.success).toBe(known.success);
  });

  test("the token is never returned to the caller", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "admin");

    const registered = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      return user!.email;
    });

    const result = await magicLink(t, registered);

    // The token is a credential; handing it to the browser put it in the
    // network tab and anywhere in between.
    expect(result).not.toHaveProperty("token");
  });

  test("a link is still created for a registered address", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "admin");

    const registered = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      return user!.email;
    });

    await magicLink(t, registered);

    const links = await t.run(async (ctx) => ctx.db.query("magic_links").collect());

    expect(links).toHaveLength(1);
    expect(links[0].user_id).toBe(userId);
  });

  test("no link is created for an unregistered address", async () => {
    const t = setupTest();

    await magicLink(t, "nobody-here@example.test");

    const links = await t.run(async (ctx) => ctx.db.query("magic_links").collect());

    expect(links).toHaveLength(0);
  });
});

describe("sign-in is rate limited", () => {
  test("repeated wrong passwords are cut off", async () => {
    const t = setupTest();

    const outcomes: string[] = [];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await signIn(t, "target@example.test", "wrong-password");
        outcomes.push("ok");
      } catch (error: any) {
        outcomes.push(error.message);
      }
    }

    // Guessing stops before it can run indefinitely.
    expect(
      outcomes.some((message) => /too many sign-in attempts/i.test(message))
    ).toBe(true);
  });

  test("one account being guessed does not lock out everyone", async () => {
    const t = setupTest();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await signIn(t, "victim@example.test", "wrong").catch(() => undefined);
    }

    // A different address still gets a real answer rather than a limit.
    const message = await signIn(t, "bystander@example.test", "wrong").catch(
      (error: any) => error.message
    );

    expect(message).not.toMatch(/too many sign-in attempts/i);
  });
});

describe("password reset attempts are rate limited", () => {
  test("guessing reset tokens is cut off", async () => {
    const t = setupTest();

    const outcomes: boolean[] = [];

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const allowed = await t.mutation(
        api.functions.auth.recordPasswordResetAttempt,
        { reset_token: `guess-${attempt}-aaaaaaaaaaaaaaaaaaaaaaaa` }
      );

      outcomes.push(allowed.ok);
    }

    // Invalid tokens all key to the same bucket, so guessing runs out.
    expect(outcomes.some((ok) => !ok)).toBe(true);
  });
});

describe("the attempt counter survives a failed sign-in", () => {
  test("attempts are still counted when the sign-in itself fails", async () => {
    const t = setupTest();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await signIn(t, "persistent@example.test", "wrong").catch(
        () => undefined
      );
    }

    // The point of the separate mutation: a rolled-back sign-in must not undo
    // the count, or guessing would never be limited.
    const allowed = await t.mutation(api.functions.auth.recordSignInAttempt, {
      identifier: "persistent@example.test",
    });

    expect(allowed.ok).toBe(false);
  });
});
