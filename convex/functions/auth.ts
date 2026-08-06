import { internalQuery, query } from "../_generated/server";
import { internalMutation, mutation } from "../lib/aggregates";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { hashPassword, verifyPassword } from "../lib/password";

type CurrentUserResponse = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  verified: boolean;
  gender?: string;
  date_of_birth?: string;
  grade?: string;
  position?: string;
  high_school_attended?: string;
  profile_image?: string;
  mfa_enabled?: boolean;
  last_login_at?: number;
  school: {
    id: string;
    name: string;
    type: string;
    status: string;
    verified: boolean;
  } | null;
} | null;

function getErrorMessage(code: string): string {
  const errorMap: Record<string, string> = {
    INVALID_CREDENTIALS: "The email or password you entered is incorrect. Please try again.",
    ACCOUNT_LOCKED: "Your account has been temporarily locked due to too many failed login attempts. Please try again later.",
    USER_BANNED: "Your account has been suspended. Please contact support.",
    USER_INACTIVE: "Your account is pending approval. Please wait for admin verification.",
    MFA_REQUIRED: "Multi-factor authentication is required. Please enter your MFA code.",
    MFA_INVALID: "The security answer you provided is incorrect. Please try again.",
    SECURITY_QUESTION_NOT_FOUND: "We couldn't find a security question for this user.",
    "An account with this email already exists for this role": "An account with this email already exists for this role. Please use a different email or sign in.",
    "Phone number already registered": "An account with this phone number already exists. Please use a different number.",
    "School selection is required for students": "Please select your school to continue registration.",
    "Phone and security question are required for students": "Both phone number and security question are required for student registration.",
    "School information is required for school administrators": "Please provide school details to register as a school administrator.",
    "High school and national ID are required for volunteers": "Please provide your high school and national ID to register as a volunteer.",
    "Invalid session": "Your session is invalid or has expired. Please sign in again.",
    "Invalid reset token": "This password reset link is invalid or has expired.",
    "User not found": "No account was found with the provided details.",
    "Magic link has expired": "This magic link has expired. Please request a new one.",
    "Magic link has already been used": "This magic link has already been used. Please request a new one.",
    "Current password is incorrect": "The password you entered is incorrect.",
    "MFA is only available for school administrators, volunteers, and administrators": "Multi-factor authentication is only available for school administrators, volunteers, and administrators.",
  };

  return errorMap[code] || "Something went wrong. Please try again or contact support.";
}

async function generateSecureToken(payload: any): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const now = Date.now();
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + (7 * 24 * 60 * 60 * 1000),
    iss: "iRankHub",
    aud: "iRankHub-users"
  };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(tokenPayload));

  const secret = process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  const byteArray = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < byteArray.length; i++) {
    binary += String.fromCharCode(byteArray[i]);
  }
  const encodedSignature = btoa(binary);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifySecureToken(token: string): Promise<any> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error('Invalid token format');
    }

    const secret = process.env.JWT_SECRET_KEY!;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = new Uint8Array(
      atob(encodedSignature).split('').map(char => char.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!isValid) {
      throw new Error('Invalid token signature');
    }

    const payload = JSON.parse(atob(encodedPayload));

    if (payload.exp && Date.now() > payload.exp) {
      throw new Error('Token expired');
    }

    if (payload.iss !== 'iRankHub' || payload.aud !== 'iRankHub-users') {
      throw new Error('Invalid token claims');
    }

    return payload;
  } catch (error: any) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}


export const signUp = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    password: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("school_admin"),
      v.literal("volunteer"),
      v.literal("admin")
    ),
    gender: v.optional(v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("non_binary")
    )),
    date_of_birth: v.optional(v.string()),
    school_id: v.optional(v.id("schools")),
    grade: v.optional(v.string()),
    security_question: v.optional(v.string()),
    security_answer: v.optional(v.string()),
    position: v.optional(v.string()),
    school_data: v.optional(v.object({
      name: v.string(),
      type: v.union(
        v.literal("Private"),
        v.literal("Public"),
        v.literal("Government Aided"),
        v.literal("International")
      ),
      country: v.string(),
      province: v.optional(v.string()),
      district: v.optional(v.string()),
      sector: v.optional(v.string()),
      cell: v.optional(v.string()),
      village: v.optional(v.string()),
      contact_name: v.string(),
      contact_email: v.string(),
      contact_phone: v.optional(v.string()),
    })),
    high_school_attended: v.optional(v.string()),
    national_id: v.optional(v.string()),
    safeguarding_certificate: v.optional(v.id("_storage")),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      ip_address: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_id: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();

      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (existingUser) {
        throw new Error("Email already registered");
      }

      if (args.phone) {
        const existingPhone = await ctx.db
          .query("users")
          .withIndex("by_phone", (q) => q.eq("phone", args.phone))
          .first();

        if (existingPhone) {
          throw new Error("Phone number already registered");
        }
      }

      if (args.role === "student") {
        if (!args.school_id) {
          throw new Error("School selection is required for students");
        }
        if (!args.phone || !args.security_question || !args.security_answer) {
          throw new Error("Phone and security question are required for students");
        }
      }

      if (args.role === "school_admin" && !args.school_data) {
        throw new Error("School information is required for school administrators");
      }

      if (args.role === "volunteer") {
        if (!args.high_school_attended || !args.national_id) {
          throw new Error("High school and national ID are required for volunteers");
        }
      }

      const { hash: passwordHash, salt: passwordSalt } = await hashPassword(args.password);

      let school_id = args.school_id;
      if (args.role === "school_admin" && args.school_data) {
        school_id = await ctx.db.insert("schools", {
          name: args.school_data.name,
          type: args.school_data.type,
          country: args.school_data.country,
          province: args.school_data.province,
          district: args.school_data.district,
          sector: args.school_data.sector,
          cell: args.school_data.cell,
          village: args.school_data.village,
          contact_name: args.school_data.contact_name,
          contact_email: args.school_data.contact_email,
          contact_phone: args.school_data.contact_phone,
          status: "active",
          verified: false,
          created_at: now,
        });
      }

      const userId = await ctx.db.insert("users", {
        name: args.name,
        email: args.email,
        phone: args.phone,
        password_hash: passwordHash,
        password_salt: passwordSalt,
        role: args.role,
        school_id,
        status: "active",
        verified: false,
        gender: args.gender,
        date_of_birth: args.date_of_birth,
        grade: args.grade,
        position: args.position,
        high_school_attended: args.high_school_attended,
        national_id: args.national_id,
        safeguarding_certificate: args.safeguarding_certificate,
        mfa_enabled: false,
        biometric_enabled: false,
        failed_login_attempts: 0,
        created_at: now,
      });

      if (args.role === "student" && args.security_question && args.security_answer) {
        const { hash: answerHash } = await hashPassword(args.security_answer.toLowerCase().trim());

        await ctx.db.insert("security_questions", {
          user_id: userId,
          question: args.security_question,
          answer_hash: answerHash,
          created_at: now,
        });
      }

      if (args.role === "school_admin" && school_id) {
        await ctx.db.patch(school_id, {
          created_by: userId,
        });
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: userId,
        action: "user_created",
        resource_type: "users",
        resource_id: userId,
        description: `User ${args.name} (${args.role}) registered`,
        new_state: JSON.stringify({
          name: args.name,
          email: args.email,
          role: args.role,
        }),
        ip_address: args.device_info?.ip_address,
        user_agent: args.device_info?.user_agent,
      });

      return {
        success: true,
        userId,
        message: "Account created successfully. Please wait for admin approval.",
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      ip_address: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_id: v.optional(v.string()),
    })),
    remember_me: v.optional(v.boolean()),
    mfa_code: v.optional(v.string()),
    expected_role: v.string()
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();

      const user = await ctx.db
        .query("users")
        .withIndex("by_email_role", (q) => q.eq("email", args.email).eq("role", args.expected_role as "student" | "school_admin" | "volunteer" | "admin"))
        .first();

      if (!user) {
        throw new Error("INVALID_CREDENTIALS");
      }

      if (user.locked_until && user.locked_until > now) {
        throw new Error("ACCOUNT_LOCKED");
      }

      const isValidPassword = await verifyPassword(args.password, user.password_hash, user.password_salt);

      if (!isValidPassword) {
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        const updateData: any = {
          failed_login_attempts: failedAttempts,
        };

        if (failedAttempts >= 5) {
          updateData.locked_until = now + (30 * 60 * 1000);
        }

        await ctx.db.patch(user._id, updateData);
        throw new Error(failedAttempts >= 5 ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS");
      }

      if (user.status === "banned") {
        throw new Error("USER_BANNED");
      }

      if (user.status === "inactive") {
        throw new Error("USER_INACTIVE");
      }

      if (user.mfa_enabled && (!args.mfa_code)) {
        const securityQuestion = await ctx.db
          .query("security_questions")
          .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
          .first();

        return {
          success: false,
          requiresMFA: true,
          userId: user._id,
          message: getErrorMessage("MFA_REQUIRED"),
          securityQuestion: securityQuestion?.question || null,
        };
      }

      if (user.mfa_enabled && args.mfa_code) {
        const securityQuestion = await ctx.db
          .query("security_questions")
          .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
          .first();

        if (!securityQuestion) {
          throw new Error("SECURITY_QUESTION_NOT_FOUND");
        }

        const isValidMFA = await verifyPassword(args.mfa_code.toLowerCase().trim(), securityQuestion.answer_hash, user.password_salt);

        if (!isValidMFA) {
          const failedAttempts = (user.failed_login_attempts || 0) + 1;
          await ctx.db.patch(user._id, {
            failed_login_attempts: failedAttempts,
          });
          throw new Error("MFA_INVALID");
        }
      }

      await ctx.db.patch(user._id, {
        failed_login_attempts: 0,
        locked_until: undefined,
        last_login_at: now,
      });

      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        verified: user.verified,
        status: user.status,
      };

      const sessionToken = await generateSecureToken(tokenPayload);
      const expiresIn = args.remember_me ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const expiresAt = now + expiresIn;

      await ctx.db.insert("auth_sessions", {
        user_id: user._id,
        session_token: sessionToken,
        device_info: args.device_info,
        expires_at: expiresAt,
        last_used_at: now,
        is_offline_capable: true,
        created_at: now,
      });

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_login",
        resource_type: "users",
        resource_id: user._id,
        description: `User ${user.name} logged in via ${args.expected_role} form`,
        ip_address: args.device_info?.ip_address,
        user_agent: args.device_info?.user_agent,
      });

      return {
        success: true,
        token: sessionToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.verified,
          school_id: user.school_id,
          profile_image: user.profile_image
        },
        expiresAt,
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const signInWithPhone = mutation({
  args: {
    name_search: v.string(),
    selected_user_id: v.id("users"),
    phone: v.string(),
    security_answer: v.string(),
    expected_role: v.string(),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      ip_address: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_id: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();

      if (args.expected_role !== "student") {
        throw new Error("INVALID_CREDENTIALS");
      }

      const user = await ctx.db.get(args.selected_user_id);

      if (!user || user.phone !== args.phone || user.role !== "student") {
        throw new Error("INVALID_CREDENTIALS");
      }

      if (args.expected_role && args.expected_role !== "student") {
        throw new Error("INVALID_CREDENTIALS");
      }

      if (user.locked_until && user.locked_until > now) {
        throw new Error("ACCOUNT_LOCKED");
      }

      if (user.status === "banned") {
        throw new Error("USER_BANNED");
      }

      if (user.status === "inactive") {
        throw new Error("USER_INACTIVE");
      }

      const securityQuestion = await ctx.db
        .query("security_questions")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .first();

      if (!securityQuestion) {
        throw new Error("SECURITY_QUESTION_NOT_FOUND");
      }

      const isValidAnswer = await verifyPassword(args.security_answer.toLowerCase().trim(), securityQuestion.answer_hash, user.password_salt);

      if (!isValidAnswer) {
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        const updateData: any = {
          failed_login_attempts: failedAttempts,
        };

        if (failedAttempts >= 5) {
          updateData.locked_until = now + (30 * 60 * 1000);
        }

        await ctx.db.patch(user._id, updateData);
        throw new Error("MFA_INVALID");
      }

      await ctx.db.patch(user._id, {
        failed_login_attempts: 0,
        locked_until: undefined,
        last_login_at: now,
      });

      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        verified: user.verified,
        status: user.status,
      };

      const sessionToken = await generateSecureToken(tokenPayload);
      const expiresAt = now + (7 * 24 * 60 * 60 * 1000);

      await ctx.db.insert("auth_sessions", {
        user_id: user._id,
        session_token: sessionToken,
        device_info: args.device_info,
        expires_at: expiresAt,
        last_used_at: now,
        is_offline_capable: true,
        created_at: now,
      });

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_login",
        resource_type: "users",
        resource_id: user._id,
        description: `Student ${user.name} logged in via phone auth`,
        ip_address: args.device_info?.ip_address,
        user_agent: args.device_info?.user_agent,
      });

      return {
        success: true,
        token: sessionToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.verified,
          school_id: user.school_id,
        },
        expiresAt,
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const searchUsersByName = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      if (args.name.length < 2) {
        return [];
      }

      const users = await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) =>
          q.search("name", args.name).eq("role", "student").eq("status", "active")
        )
        .take(10);

      return users.map(user => ({
        id: user._id,
        name: user.name,
        phone: user.phone?.slice(-4),
      }));
    } catch (error: any) {
      console.error("Error searching users:", error);
      return [];
    }
  },
});

export const getSecurityQuestion = query({
  args: {
    user_id: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (!user || user.phone !== args.phone || user.role !== "student") {
      return { error: "Invalid request" };
    }

    const securityQuestion = await ctx.db
      .query("security_questions")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!securityQuestion) {
      return { error: "Security question not found" };
    }

    return { question: securityQuestion.question };
  },
});


export const generateMagicLink = mutation({
  args: {
    email: v.string(),
    purpose: v.union(
      v.literal("login"),
      v.literal("password_reset"),
      v.literal("email_verification"),
      v.literal("account_recovery")
    ),
  },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (!user && args.purpose === "login") {
        throw new Error("User not found");
      }

      const now = Date.now();
      const token = generateRandomToken();
      const expiresAt = now + (15 * 60 * 1000);

      await ctx.db.insert("magic_links", {
        email: args.email,
        token,
        user_id: user?._id,
        purpose: args.purpose,
        expires_at: expiresAt,
        created_at: now,
      });

      return {
        success: true,
        message: "Magic link sent to your email address.",
        token
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const verifyMagicLink = mutation({
  args: {
    token: v.string(),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      ip_address: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_id: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();

      const magicLink = await ctx.db
        .query("magic_links")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first();

      if (!magicLink) {
        throw new Error("Invalid or expired magic link");
      }

      if (magicLink.expires_at < now) {
        await ctx.db.delete(magicLink._id);
        throw new Error("Magic link has expired");
      }

      if (magicLink.used_at) {
        throw new Error("Magic link has already been used");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", magicLink.email))
        .first();

      if (!user) {
        throw new Error("User not found");
      }

      await ctx.db.patch(magicLink._id, {
        used_at: now,
      });

      if (magicLink.purpose === "password_reset") {
        const resetToken = await generateSecureToken({
          userId: user._id,
          purpose: "password_reset",
          exp: now + (60 * 60 * 1000),
        });

        return {
          success: true,
          purpose: "password_reset",
          resetToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            verified: user.verified,
            safeguarding_certificate: user.safeguarding_certificate ?? null,
          },
        };
      }

      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        verified: user.verified,
        status: user.status,
      };

      const sessionToken = await generateSecureToken(tokenPayload);
      const expiresAt = now + (7 * 24 * 60 * 60 * 1000);

      await ctx.db.insert("auth_sessions", {
        user_id: user._id,
        session_token: sessionToken,
        device_info: args.device_info,
        expires_at: expiresAt,
        last_used_at: now,
        is_offline_capable: true,
        created_at: now,
      });

      await ctx.db.patch(user._id, {
        last_login_at: now,
      });

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_login",
        resource_type: "users",
        resource_id: user._id,
        description: `User ${user.name} logged in via magic link`,
        ip_address: args.device_info?.ip_address,
        user_agent: args.device_info?.user_agent,
      });

      return {
        success: true,
        purpose: "login",
        token: sessionToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.verified,
          school_id: user.school_id,
        },
        expiresAt,
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const resetPassword = mutation({
  args: {
    reset_token: v.string(),
    new_password: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const payload = await verifySecureToken(args.reset_token);

      if (payload.purpose !== "password_reset") {
        throw new Error("Invalid reset token");
      }

      const user = await ctx.db.get(payload.userId);
      if (!user) {
        throw new Error("User not found");
      }

      const { hash: newPasswordHash, salt: newPasswordSalt } = await hashPassword(args.new_password);

      await ctx.db.patch(user._id, {
        status: "active",
        password_hash: newPasswordHash,
        password_salt: newPasswordSalt,
        password_changed_at: Date.now(),
        failed_login_attempts: 0,
        locked_until: undefined,
      });

      const userSessions = await ctx.db
        .query("auth_sessions")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id as Id<"users">))
        .collect();

      for (const session of userSessions) {
        await ctx.db.delete(session._id);
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id as Id<"users">,
        action: "user_password_changed",
        resource_type: "users",
        resource_id: user._id,
        description: "User reset password via magic link",
      });

      return {
        success: true,
        message: "Password reset successfully. Please sign in with your new password.",
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const enableMFA = mutation({
  args: {
    token: v.string(),
    current_password: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.token,
      });

      if (!sessionResult.valid || !sessionResult.user) {
        throw new Error("Invalid session");
      }

      const user: Doc<"users"> | null = await ctx.db.get(sessionResult.user.id);
      if (!user) {
        throw new Error("User not found");
      }

      const isPasswordValid = await verifyPassword(args.current_password, user.password_hash, user.password_salt);
      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      if (!["school_admin", "volunteer", "admin"].includes(user.role)) {
        throw new Error("MFA is only available for school administrators, volunteers, and administrators");
      }

      await ctx.db.patch(user._id, {
        mfa_enabled: true,
      });

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_updated",
        resource_type: "users",
        resource_id: user._id,
        description: "User enabled multi-factor authentication",
      });

      return {
        success: true,
        message: "Multi-factor authentication has been enabled for your account.",
      };

    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const disableMFA = mutation({
  args: {
    token: v.string(),
    current_password: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.token,
      });

      if (!sessionResult.valid || !sessionResult.user) {
        throw new Error("Invalid session");
      }

      const user: Doc<"users"> | null = await ctx.db.get(sessionResult.user.id);
      if (!user) {
        throw new Error("User not found");
      }

      const isPasswordValid = await verifyPassword(args.current_password, user.password_hash, user.password_salt);
      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      await ctx.db.patch(user._id, {
        mfa_enabled: false,
      });

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_updated",
        resource_type: "users",
        resource_id: user._id,
        description: "User disabled multi-factor authentication",
      });

      return {
        success: true,
        message: "Multi-factor authentication has been disabled for your account.",
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const verifySessionReadOnly = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      const payload = await verifySecureToken(args.token);

      const session = await ctx.db
        .query("auth_sessions")
        .withIndex("by_session_token", (q) => q.eq("session_token", args.token))
        .first();

      if (!session) {
        return { valid: false, error: "Session not found" };
      }

      if (payload.userId && payload.userId !== session.user_id) {
        return { valid: false, error: "Token user mismatch" };
      }

      const now = Date.now();

      if (session.expires_at < now) {
        return { valid: false, error: "Session expired" };
      }

      const user = await ctx.db.get(session.user_id);
      if (!user) {
        return { valid: false, error: "User not found" };
      }

      return {
        valid: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.verified,
          school_id: user.school_id,
          last_login: user.last_login_at,
          created_at: user.created_at,
        },
        session: {
          expires_at: session.expires_at,
          is_offline_valid:
            session.is_offline_capable &&
            now <= session.last_used_at + 2 * 24 * 60 * 60 * 1000,
        },
      };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  },
});

export const verifySession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      const payload = await verifySecureToken(args.token);

      const session = await ctx.db
        .query("auth_sessions")
        .withIndex("by_session_token", (q) => q.eq("session_token", args.token))
        .first();

      if (!session) {
        return { valid: false, error: "Session not found" };
      }

      if (payload.userId && payload.userId !== session.user_id) {
        return { valid: false, error: "Token user mismatch" };
      }

      const now = Date.now();

      if (session.expires_at < now) {
        await ctx.db.delete(session._id);
        return { valid: false, error: "Session expired" };
      }

      await ctx.db.patch(session._id, {
        last_used_at: now,
      });

      const user = await ctx.db.get(session.user_id);
      if (!user) {
        return { valid: false, error: "User not found" };
      }

      return {
        valid: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.verified,
          school_id: user.school_id,
          last_login: user.last_login_at,
          created_at: user.created_at,
        },
        session: {
          expires_at: session.expires_at,
          is_offline_valid: session.is_offline_capable &&
            now <= session.last_used_at + (2 * 24 * 60 * 60 * 1000),
        },
      };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  },
});

export const signOut = mutation({
  args: {
    token: v.string(),
    device_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const session = await ctx.db
        .query("auth_sessions")
        .withIndex("by_session_token", (q) =>
          q.eq("session_token", args.token)
        )
        .first();

      if (session) {
        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: session.user_id,
          action: "user_logout",
          resource_type: "users",
          resource_id: session.user_id,
          description: "User logged out",
        });

        await ctx.db.delete(session._id);

        if (args.device_id) {
          const deviceSessions = await ctx.db
            .query("auth_sessions")
            .withIndex("by_user_id_device_id", (q) =>
              q.eq("user_id", session.user_id).eq("device_info.device_id", args.device_id!)
            )
            .collect();

          for (const deviceSession of deviceSessions) {
            await ctx.db.delete(deviceSession._id);
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error("Sign out error:", error);
      return { success: true };
    }
  },
});

export const updateSecurityQuestion = mutation({
  args: {
    question: v.string(),
    answer: v.string(),
    current_password: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.token,
      });

      if (!sessionResult.valid || !sessionResult.user) {
        throw new Error("Invalid session");
      }

      const user: Doc<"users"> | null = await ctx.db.get(sessionResult.user.id);
      if (!user || !("password_hash" in user)) {
        throw new Error("Invalid user record");
      }

      const isPasswordValid = await verifyPassword(args.current_password, user.password_hash, user.password_salt);
      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      const { hash: answerHash } = await hashPassword(args.answer.toLowerCase().trim(), user.password_salt);

      const existingQuestion = await ctx.db
        .query("security_questions")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .first();

      const now = Date.now();

      if (existingQuestion) {
        await ctx.db.patch(existingQuestion._id, {
          question: args.question,
          answer_hash: answerHash,
          updated_at: now,
        });
      } else {
        await ctx.db.insert("security_questions", {
          user_id: user._id,
          question: args.question,
          answer_hash: answerHash,
          created_at: now,
        });
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_updated",
        resource_type: "users",
        resource_id: user._id,
        description: "Student updated security question",
      });

      return { success: true, message: "Security question updated successfully." };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const changePassword = mutation({
  args: {
    current_password: v.string(),
    new_password: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.token,
      });

      if (!sessionResult.valid || !sessionResult.user) {
        throw new Error("Invalid session");
      }

      const user: Doc<"users"> | null = await ctx.db.get(sessionResult.user.id);
      if (!user || !("password_hash" in user)) {
        throw new Error("User not found or invalid user record");
      }

      const isCurrentPasswordValid = await verifyPassword(args.current_password, user.password_hash, user.password_salt);
      if (!isCurrentPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      const { hash: newPasswordHash, salt: newPasswordSalt } = await hashPassword(args.new_password);

      await ctx.db.patch(user._id, {
        password_hash: newPasswordHash,
        password_salt: newPasswordSalt,
        password_changed_at: Date.now(),
      });

      const userSessions = await ctx.db
        .query("auth_sessions")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .collect();

      for (const session of userSessions) {
        if (session.session_token !== args.token) {
          await ctx.db.delete(session._id);
        }
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: user._id,
        action: "user_password_changed",
        resource_type: "users",
        resource_id: user._id,
        description: "User changed password",
      });

      return { success: true, message: "Password changed successfully." };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const createMagicLink = internalMutation({
  args: {
    email: v.string(),
    token: v.string(),
    purpose: v.union(
      v.literal("login"),
      v.literal("password_reset"),
      v.literal("account_recovery")
    ),
    expires_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("magic_links", {
      email: args.email,
      token: args.token,
      purpose: args.purpose,
      expires_at: args.expires_at,
      created_at: Date.now(),
    });
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    console.log("Starting cleanup of expired auth data...");

    const expiredSessions = await ctx.db
      .query("auth_sessions")
      .withIndex("by_expires_at", (q) => q.lt("expires_at", now))
      .collect();

    for (const session of expiredSessions) {
      await ctx.db.delete(session._id);
    }

    const expiredMagicLinks = await ctx.db
      .query("magic_links")
      .withIndex("by_expires_at", (q) => q.lt("expires_at", now))
      .collect();

    for (const link of expiredMagicLinks) {
      await ctx.db.delete(link._id);
    }

    const expiredResetTokens = await ctx.db
      .query("password_reset_tokens")
      .withIndex("by_expires_at", (q) => q.lt("expires_at", now))
      .collect();

    for (const token of expiredResetTokens) {
      await ctx.db.delete(token._id);
    }

    const result = {
      cleaned: {
        sessions: expiredSessions.length,
        magic_links: expiredMagicLinks.length,
        reset_tokens: expiredResetTokens.length,
      },
      cleanedAt: new Date().toISOString(),
    };

    console.log("Auth cleanup completed:", result);

    return result;
  },
});

export const getCurrentUser = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<CurrentUserResponse> => {
    try {
      let sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
        token: args.token,
      });

      if (!sessionResult.valid || !sessionResult.user) return null;

      const user = await ctx.db.get<"users">(sessionResult.user.id);
      if (!user || !("name" in user)) return null;

      let school: Doc<"schools"> | null = null;
      if (user.school_id) {
        const schoolDoc = await ctx.db.get<"schools">(user.school_id);
        if (schoolDoc && "name" in schoolDoc) {
          school = schoolDoc as Doc<"schools">;
        }
      }

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        verified: user.verified,
        gender: user.gender,
        date_of_birth: user.date_of_birth,
        grade: user.grade,
        position: user.position,
        high_school_attended: user.high_school_attended,
        profile_image: user.profile_image,
        mfa_enabled: user.mfa_enabled,
        last_login_at: user.last_login_at,
        school: school
          ? {
            id: school._id,
            name: school.name,
            type: school.type,
            status: school.status,
            verified: school.verified,
          }
          : null,
      };
    } catch (error: any) {
      console.error("Get current user error:", error);
      return null;
    }
  },
});

export const refreshToken = internalMutation({
  args: {
    token: v.string(),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      ip_address: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_id: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();

      const session = await ctx.db
        .query("auth_sessions")
        .withIndex("by_session_token", (q) => q.eq("session_token", args.token))
        .first();

      if (!session) {
        throw new Error("Session not found");
      }

      const gracePeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
      if (session.expires_at < now - gracePeriod) {
        throw new Error("Session too old to refresh");
      }

      const user = await ctx.db.get(session.user_id);
      if (!user) {
        throw new Error("User not found");
      }

      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        verified: user.verified,
        status: user.status,
        iat: now,
      };

      const newSessionToken = await generateSecureToken(tokenPayload);
      const expiresAt = now + (7 * 24 * 60 * 60 * 1000);

      await ctx.db.patch(session._id, {
        session_token: newSessionToken,
        expires_at: expiresAt,
        last_used_at: now,
        device_info: args.device_info || session.device_info,
      });

      return {
        success: true,
        token: newSessionToken,
        expiresAt,
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const approveUser = mutation({
  args: {
    user_id: v.id("users"),
    admin_token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.admin_token,
      });

      if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      const userToApprove = await ctx.db.get(args.user_id);
      if (!userToApprove) {
        throw new Error("User not found");
      }

      await ctx.db.patch(args.user_id, {
        verified: true,
        status: "active",
      });

      if (userToApprove.role === "school_admin" && userToApprove.school_id) {
        await ctx.db.patch(userToApprove.school_id, {
          verified: true,
        });
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: sessionResult.user.id,
        action: "user_updated",
        resource_type: "users",
        resource_id: args.user_id,
        description: `Admin approved user ${userToApprove.name}`,
      });

      await ctx.db.insert("notifications", {
        user_id: args.user_id,
        title: "Account Approved",
        message: "Your account has been approved by an administrator. You can now access all features.",
        type: "auth",
        is_read: false,
        expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
        created_at: Date.now(),
      });

      return { success: true, message: "User approved successfully." };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const banUser = mutation({
  args: {
    user_id: v.id("users"),
    reason: v.string(),
    admin_token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.admin_token,
      });

      if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      const userToBan = await ctx.db.get(args.user_id);
      if (!userToBan) {
        throw new Error("User not found");
      }

      if (userToBan.role === "admin") {
        throw new Error("Cannot ban other administrators");
      }

      await ctx.db.patch(args.user_id, {
        status: "banned",
      });

      const userSessions = await ctx.db
        .query("auth_sessions")
        .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
        .collect();

      for (const session of userSessions) {
        await ctx.db.delete(session._id);
      }

      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: sessionResult.user.id,
        action: "user_deleted",
        resource_type: "users",
        resource_id: args.user_id,
        description: `Admin banned user ${userToBan.name}. Reason: ${args.reason}`,
      });

      return { success: true, message: "User banned successfully." };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

export const getPendingApprovals = query({
  args: {
    admin_token: v.string(),
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
        token: args.admin_token,
      });

      if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      const page = args.page || 1;
      const limit = args.limit || 20;

      const pendingUsers = await ctx.db
        .query("users")
        .withIndex("by_verified", (q) => q.eq("verified", false))
        .order("desc")
        .paginate({
          numItems: limit,
          cursor: page > 1 ? String(page) : null
        });

      const usersWithSchools = await Promise.all(
        pendingUsers.page.map(async (user) => {
          let school = null;
          if (user.school_id) {
            school = await ctx.db.get(user.school_id);
          }

          return {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            created_at: user.created_at,
            school: school ? {
              id: school._id,
              name: school.name,
              type: school.type,
            } : null,
          };
        })
      );

      return {
        users: usersWithSchools,
        hasMore: pendingUsers.continueCursor !== null,
        nextPage: pendingUsers.continueCursor,
      };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});

type AuthSession = {
  _id: Id<"auth_sessions">;
  user_id: Id<"users">;
  device_info?: unknown;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  session_token: string;
  is_offline_capable: boolean;
};

type SessionInfo = {
  id: Id<"auth_sessions">;
  device_info?: unknown;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  is_current: boolean;
  is_offline_capable: boolean;
};

export const getUserSessions = query({
  args: {
    token: v.string(),
  },
  handler: async (
    ctx,
    args: { token: string }
  ): Promise<SessionInfo[]> => {
    try {
      const sessionResult = await ctx.runQuery(
        internal.functions.auth.verifySessionReadOnly,
        { token: args.token }
      );

      if (!sessionResult.valid || !sessionResult.user) {
        throw new Error("Invalid session");
      }

      const sessions: AuthSession[] = await ctx.db
        .query("auth_sessions")
        .withIndex("by_user_id", (q) => q.eq("user_id", sessionResult.user.id))
        .collect();

      return sessions.map((session: AuthSession): SessionInfo => ({
        id: session._id,
        device_info: session.device_info,
        created_at: session.created_at,
        last_used_at: session.last_used_at,
        expires_at: session.expires_at,
        is_current: session.session_token === args.token,
        is_offline_capable: session.is_offline_capable,
      }));
    } catch (error: any) {
      console.error("Get user sessions error:", error);
      return [];
    }
  },
});

export const revokeSession = mutation({
  args: {
    session_id: v.id("auth_sessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
        token: args.token,
      });

      if (!sessionResult.valid) {
        throw new Error("Invalid session");
      }

      const sessionToRevoke = await ctx.db.get(args.session_id);
      if (!sessionToRevoke || !sessionResult.user) {
        throw new Error("Session not found");
      }

      if (sessionToRevoke.user_id !== sessionResult.user.id) {
        throw new Error("Unauthorized");
      }

      await ctx.db.delete(args.session_id);

      return { success: true, message: "Session revoked successfully." };
    } catch (error: any) {
      throw new Error(getErrorMessage(error.message));
    }
  },
});