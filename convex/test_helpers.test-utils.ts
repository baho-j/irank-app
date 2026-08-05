import { convexTest } from "convex-test";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

export const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);

type Role = "student" | "school_admin" | "volunteer" | "admin";

export function setupTest() {
  return convexTest(schema, modules);
}

/**
 * Mirrors generateSecureToken in convex/functions/auth.ts. Sessions are looked
 * up by token, but verifySessionReadOnly also verifies the HMAC signature, so
 * seeded tokens have to be signed the same way.
 */
async function signToken(payload: Record<string, unknown>): Promise<string> {
  const now = Date.now();

  const encodedHeader = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = btoa(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + 7 * 24 * 60 * 60 * 1000,
      iss: "iRankHub",
      aud: "iRankHub-users",
    })
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.JWT_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Seeds a user plus a matching auth_sessions row and returns the raw token.
 * verifySessionReadOnly looks sessions up by token, so a seeded row is
 * sufficient to authenticate without going through signIn.
 */
export async function createUserWithSession(
  t: ReturnType<typeof setupTest>,
  role: Role,
  overrides: {
    name?: string;
    email?: string;
    school_id?: Id<"schools">;
    expires_at?: number;
  } = {}
) {
  const now = Date.now();

  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: overrides.name ?? `Test ${role}`,
      email: overrides.email ?? `${role}-${Math.random().toString(36).slice(2)}@example.test`,
      password_hash: "hash",
      password_salt: "salt",
      role,
      status: "active",
      verified: true,
      school_id: overrides.school_id,
      created_at: now,
    })
  );

  const token = await signToken({ userId, role });

  await t.run(async (ctx) => {
    await ctx.db.insert("auth_sessions", {
      user_id: userId,
      session_token: token,
      expires_at: overrides.expires_at ?? now + 24 * 60 * 60 * 1000,
      last_used_at: now,
      is_offline_capable: false,
      created_at: now,
    });
  });

  return { userId, token };
}

export async function createSchool(
  t: ReturnType<typeof setupTest>,
  name = "Test School"
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("schools", {
      name,
      type: "Private",
      country: "Rwanda",
      contact_name: "Contact",
      contact_email: "school@example.test",
      status: "active",
      verified: true,
      created_at: Date.now(),
    })
  );
}
