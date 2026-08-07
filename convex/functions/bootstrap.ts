import { v } from "convex/values";
import { internalMutation } from "../lib/aggregates";
import { hashPassword } from "../lib/password";

/**
 * Creates the first administrator.
 *
 * A fresh deployment has no accounts, and admins are only creatable by an
 * existing admin — so without this there is no way in. It is an
 * `internalMutation`, which means it cannot be reached from a browser: the only
 * way to run it is from a terminal with deploy credentials.
 *
 *   npx convex run functions/bootstrap:createFirstAdmin '{"name":"...","email":"...","password":"..."}'
 *
 * It refuses once any administrator exists, so it cannot be used later to
 * quietly grant someone access.
 */
export const createFirstAdmin = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ created: boolean; message: string }> => {
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();

    if (existingAdmin) {
      return {
        created: false,
        message:
          "An administrator already exists. Create further administrators from Admin → Users.",
      };
    }

    const email = args.email.trim().toLowerCase();

    const taken = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (taken) {
      return {
        created: false,
        message: `${email} is already registered as a ${taken.role}.`,
      };
    }

    if (args.password.length < 8) {
      return { created: false, message: "Choose a password of at least 8 characters." };
    }

    const { hash, salt } = await hashPassword(args.password);
    const now = Date.now();

    await ctx.db.insert("users", {
      name: args.name.trim(),
      email,
      phone: args.phone,
      password_hash: hash,
      password_salt: salt,
      role: "admin",
      status: "active",
      // Verified on creation: there is nobody to approve the first account.
      verified: true,
      created_at: now,
    });

    return {
      created: true,
      message: `Administrator ${email} created. Sign in at /signin/admin.`,
    };
  },
});
