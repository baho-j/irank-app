import { query } from "../../_generated/server";
import { mutation } from "../../lib/aggregates";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { hashPassword } from "../../lib/password";
import { Doc, Id } from "../../_generated/dataModel";

function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const getUsers = query({
  args: {
    admin_token: v.string(),
    search: v.optional(v.string()),
    role: v.optional(v.union(
      v.literal("all"),
      v.literal("student"),
      v.literal("school_admin"),
      v.literal("volunteer"),
      v.literal("admin")
    )),
    status: v.optional(v.union(
      v.literal("all"),
      v.literal("active"),
      v.literal("inactive"),
      v.literal("banned")
    )),
    verified: v.optional(v.union(
      v.literal("all"),
      v.literal("verified"),
      v.literal("pending")
    )),
    page: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { search, role, status, verified, page, limit } = args;

    if (search && search.trim() !== "") {
      const searchResults = await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) => {
          let query = q.search("name", search);
          if (role && role !== "all") query = query.eq("role", role);
          if (status && status !== "all") query = query.eq("status", status);
          if (verified && verified !== "all") {
            query = query.eq("verified", verified === "verified");
          }
          return query;
        })
        .collect();

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedResults = searchResults.slice(startIndex, endIndex);

      const usersWithSchools = await Promise.all(
        paginatedResults.map(async (user) => {
          let school = null;
          if (user.school_id) {
            school = await ctx.db.get(user.school_id);
          }

          return {
            ...user,
            school: school ? {
              id: school._id,
              name: school.name,
              type: school.type,
              status: school.status,
              verified: school.verified,
            } : null,
          };
        })
      );

      return {
        users: usersWithSchools,
        totalCount: searchResults.length,
        hasMore: endIndex < searchResults.length,
        nextPage: endIndex < searchResults.length ? page + 1 : null,
      };
    }


    let usersQuery;

    if (role && role !== "all") {
      if (status && status !== "all") {
        usersQuery = ctx.db
          .query("users")
          .withIndex("by_role_status", (q) => q.eq("role", role).eq("status", status));
      } else {
        usersQuery = ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", role));
      }
    } else if (status && status !== "all") {
      usersQuery = ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", status));
    } else if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      usersQuery = ctx.db
        .query("users")
        .withIndex("by_verified", (q) => q.eq("verified", isVerified));
    } else {
      usersQuery = ctx.db.query("users");
    }

    let allUsers = await usersQuery.collect();

    if (role && role !== "all") {
      allUsers = allUsers.filter(u => u.role === role);
    }

    if (status && status !== "all") {
      allUsers = allUsers.filter(u => u.status === status);
    }

    if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      allUsers = allUsers.filter(u => u.verified === isVerified);
    }

    const totalCount = allUsers.length;

    const sortedUsers = allUsers.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    const usersWithSchools = await Promise.all(
      paginatedUsers.map(async (user) => {
        let school = null;
        if (user.school_id) {
          school = await ctx.db.get(user.school_id);
        }

        return {
          ...user,
          school: school ? {
            id: school._id,
            name: school.name,
            type: school.type,
            status: school.status,
            verified: school.verified,
          } : null,
        };
      })
    );

    return {
      users: usersWithSchools,
      totalCount,
      hasMore: endIndex < totalCount,
      nextPage: endIndex < totalCount ? page + 1 : null,
    };
  },
});

export const updateUserStatus = mutation({
  args: {
    admin_token: v.string(),
    user_id: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("banned")
    ),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    const previousStatus = user.status;

    await ctx.db.patch(args.user_id, {
      status: args.status,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "user_updated",
      resource_type: "users",
      resource_id: args.user_id,
      description: `Admin changed user ${user.name} status from ${previousStatus} to ${args.status}`,
      previous_state: JSON.stringify({ status: previousStatus }),
      new_state: JSON.stringify({ status: args.status }),
    });

    await ctx.db.insert("notifications", {
      user_id: args.user_id,
      title: "Account Status Updated",
      message: `Your account status has been changed to ${args.status}.`,
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const verifyUser = mutation({
  args: {
    admin_token: v.string(),
    user_id: v.id("users"),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.user_id, {
      verified: args.verified,
      status: args.verified ? "active" : user.status,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "user_verified",
      resource_type: "users",
      resource_id: args.user_id,
      description: `Admin ${args.verified ? 'verified' : 'unverified'} user ${user.name}`,
    });

    await ctx.db.insert("notifications", {
      user_id: args.user_id,
      title: args.verified ? "Account Verified" : "Account Verification Removed",
      message: args.verified
        ? "Your account has been verified by an administrator."
        : "Your account verification has been removed by an administrator.",
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const deleteUser = mutation({
  args: {
    admin_token: v.string(),
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    const userTeams: Doc<"teams">[] = [];
    for await (const team of ctx.db.query("teams")) {
      if (team.members.includes(args.user_id)) {
        userTeams.push(team);
      }
    }

    if (userTeams.length > 0) {
      throw new Error("Cannot delete user who is part of tournament teams. Please remove from teams first.");
    }

    if (user.role === "school_admin" && user.school_id) {
      const school = await ctx.db.get(user.school_id);
      if (school && school.created_by === args.user_id) {
        throw new Error("Cannot delete school administrator who created the school. Please transfer ownership first.");
      }
    }

    if (user.profile_image) {
      try {
        await ctx.storage.delete(user.profile_image);
      } catch (error) {
        console.log("Could not delete profile image:", error);
      }
    }

    if (user.safeguarding_certificate) {
      try {
        await ctx.storage.delete(user.safeguarding_certificate);
      } catch (error) {
        console.log("Could not delete safeguarding certificate:", error);
      }
    }

    await ctx.db.delete(args.user_id);

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "user_deleted",
      resource_type: "users",
      resource_id: args.user_id,
      description: `Admin deleted user ${user.name} (${user.email})`,
      previous_state: JSON.stringify({
        name: user.name,
        email: user.email,
        role: user.role,
      }),
    });

    return { success: true };
  },
});

export const bulkUpdateUsers = mutation({
  args: {
    admin_token: v.string(),
    user_ids: v.array(v.id("users")),
    action: v.union(
      v.literal("verify"),
      v.literal("unverify"),
      v.literal("activate"),
      v.literal("deactivate"),
      v.literal("ban")
    ),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const results = [];

    for (const userId of args.user_ids) {
      try {
        const user = await ctx.db.get(userId);
        if (!user) {
          results.push({ userId, success: false, error: "User not found" });
          continue;
        }

        let updateData: any = { updated_at: Date.now() };
        let notificationTitle = "";
        let notificationMessage = "";

        switch (args.action) {
          case "verify":
            updateData.verified = true;
            updateData.status = "active";
            notificationTitle = "Account Verified";
            notificationMessage = "Your account has been verified by an administrator.";
            break;
          case "unverify":
            updateData.verified = false;
            notificationTitle = "Account Verification Removed";
            notificationMessage = "Your account verification has been removed by an administrator.";
            break;
          case "activate":
            updateData.status = "active";
            notificationTitle = "Account Activated";
            notificationMessage = "Your account has been activated by an administrator.";
            break;
          case "deactivate":
            updateData.status = "inactive";
            notificationTitle = "Account Deactivated";
            notificationMessage = "Your account has been deactivated by an administrator.";
            break;
          case "ban":
            updateData.status = "banned";
            notificationTitle = "Account Banned";
            notificationMessage = "Your account has been banned by an administrator.";
            break;
        }

        await ctx.db.patch(userId, updateData);

        await ctx.db.insert("notifications", {
          user_id: userId,
          title: notificationTitle,
          message: notificationMessage,
          type: "system",
          is_read: false,
          expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
          created_at: Date.now(),
        });

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: sessionResult.user.id,
          action: "user_updated",
          resource_type: "users",
          resource_id: userId,
          description: `Admin performed bulk action ${args.action} on user ${user.name}`,
        });

        results.push({ userId, success: true });
      } catch (error: any) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    return { results };
  },
});

export const createUser = mutation({
  args: {
    admin_token: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    role: v.union(
      v.literal("student"),
      v.literal("school_admin"),
      v.literal("volunteer"),
      v.literal("admin")
    ),
    school_id: v.optional(v.id("schools")),
    gender: v.optional(v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("non_binary")
    )),
    date_of_birth: v.optional(v.string()),
    grade: v.optional(v.string()),
    position: v.optional(v.string()),
    high_school_attended: v.optional(v.string()),
    national_id: v.optional(v.string()),
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
    security_question: v.optional(v.string()),
    security_answer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      throw new Error("Email already exists");
    }

    if (args.phone) {
      const existingPhone = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", args.phone))
        .first();

      if (existingPhone) {
        throw new Error("Phone number already exists");
      }
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await hashPassword(tempPassword);

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
        verified: true,
        created_at: Date.now(),
      });
    }

    const userData: any = {
      name: args.name,
      email: args.email,
      phone: args.phone,
      password_hash: passwordHash.hash,
      password_salt: passwordHash.salt,
      role: args.role,
      school_id,
      status: "inactive",
      verified: true,
      gender: args.gender,
      date_of_birth: args.date_of_birth,
      created_at: Date.now(),
      failed_login_attempts: 0,
      biometric_enabled:false,
      mfa_enabled: false,
    };

    if (args.role === "student") {
      userData.grade = args.grade;
    } else if (args.role === "school_admin") {
      userData.position = args.position;
    } else if (args.role === "volunteer") {
      userData.high_school_attended = args.high_school_attended;
      userData.national_id = args.national_id;
    }

    const userId = await ctx.db.insert("users", userData);

    if (args.role === "student" && args.security_question && args.security_answer) {
      const { hash: answerHash } = await hashPassword(args.security_answer.toLowerCase().trim());
      await ctx.db.insert("security_questions", {
        user_id: userId,
        question: args.security_question,
        answer_hash: answerHash,
        created_at: Date.now(),
      });
    }

    if (args.role === "school_admin" && school_id) {
      await ctx.db.patch(school_id, {
        created_by: userId,
      });
    }

    const resetToken = generateRandomToken();
    await ctx.db.insert("magic_links", {
      email: args.email,
      token: resetToken,
      user_id: userId,
      expires_at: Date.now() + (24 * 60 * 60 * 1000),
      created_at: Date.now(),
      purpose: "password_reset",
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "user_created",
      resource_type: "users",
      resource_id: userId,
      description: `Admin created user ${args.name} (${args.email}) with role ${args.role}`,
    });

    await ctx.db.insert("notifications", {
      user_id: userId,
      title: "Welcome to iRankHub",
      message: "Your account has been created by an administrator. Please check your email for login instructions.",
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return {
      success: true,
      userId,
      resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
      tempPassword
    };
  },
});

export const bulkCreateUsers = mutation({
  args: {
    admin_token: v.string(),
    users: v.array(v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
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
      school_name: v.optional(v.string()),
      school_id: v.optional(v.string()),
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
      date_of_birth: v.optional(v.string()),
      national_id: v.optional(v.string()),
      high_school_attended: v.optional(v.string()),
    }))
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const results = [];

    for (const userData of args.users) {
      try {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", userData.email))
          .first();

        if (existingUser) {
          results.push({
            success: false,
            error: "Email already exists",
            userData: {
              name: userData.name,
              email: userData.email,
              role: userData.role
            }
          });
          continue;
        }

        if (userData.phone) {
          const existingPhone = await ctx.db
            .query("users")
            .withIndex("by_phone", (q) => q.eq("phone", userData.phone))
            .first();

          if (existingPhone) {
            results.push({
              success: false,
              error: "Phone number already exists",
              userData: {
                name: userData.name,
                email: userData.email,
                role: userData.role
              }
            });
            continue;
          }
        }

        let school_id = userData.school_id ? userData.school_id as Id<"schools"> : undefined;

        if (userData.role === "student") {
          if (userData.school_name) {
            const schoolName = userData.school_name;
            const school = await ctx.db
              .query("schools")
              .withIndex("by_name", (q) => q.eq("name", schoolName))
              .filter((q) => q.eq(q.field("status"), "active"))
              .first();

            if (!school) {
              results.push({
                success: false,
                error: `School "${userData.school_name}" not found or inactive`,
                userData: {
                  name: userData.name,
                  email: userData.email,
                  role: userData.role
                }
              });
              continue;
            }
            school_id = school._id;
          } else if (userData.school_id) {
            const school = await ctx.db.get(userData.school_id as Id<"schools">);
            if (!school || school.status !== "active") {
              results.push({
                success: false,
                error: `School with ID "${userData.school_id}" not found or inactive`,
                userData: {
                  name: userData.name,
                  email: userData.email,
                  role: userData.role
                }
              });
              continue;
            }
            school_id = userData.school_id as Id<"schools">;
          }
        }
        if (userData.role === "student") {
          if (!school_id || !userData.grade || !userData.security_question || !userData.security_answer) {
            results.push({
              success: false,
              error: "Missing required fields for student (school_name or school_id, grade, security_question, security_answer)",
              userData: {
                name: userData.name,
                email: userData.email,
                role: userData.role
              }
            });
            continue;
          }
        }

        if (userData.role === "school_admin" && !userData.school_data && !userData.position) {
          results.push({
            success: false,
            error: "Missing required fields for school admin (position or school_data)",
            userData: {
              name: userData.name,
              email: userData.email,
              role: userData.role
            }
          });
          continue;
        }

        if (userData.role === "volunteer") {
          if (!userData.date_of_birth || !userData.national_id || !userData.high_school_attended) {
            results.push({
              success: false,
              error: "Missing required fields for volunteer (date_of_birth, national_id, high_school_attended)",
              userData: {
                name: userData.name,
                email: userData.email,
                role: userData.role
              }
            });
            continue;
          }
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await hashPassword(tempPassword);

        if (userData.role === "school_admin" && userData.school_data) {
          school_id = await ctx.db.insert("schools", {
            name: userData.school_data.name,
            type: userData.school_data.type,
            country: userData.school_data.country,
            province: userData.school_data.province,
            district: userData.school_data.district,
            sector: userData.school_data.sector,
            cell: userData.school_data.cell,
            village: userData.school_data.village,
            contact_name: userData.school_data.contact_name,
            contact_email: userData.school_data.contact_email,
            contact_phone: userData.school_data.contact_phone,
            status: "active",
            verified: true,
            created_at: Date.now(),
          });
        }

        const newUserData: any = {
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          password_hash: passwordHash.hash,
          password_salt: passwordHash.salt,
          role: userData.role,
          school_id,
          status: "inactive",
          verified: true,
          gender: userData.gender,
          created_at: Date.now(),
          failed_login_attempts: 0,
          biometric_enabled: false,
          mfa_enabled: false,
        };

        if (userData.role === "student") {
          newUserData.grade = userData.grade;
        } else if (userData.role === "school_admin") {
          newUserData.position = userData.position;
        } else if (userData.role === "volunteer") {
          newUserData.date_of_birth = userData.date_of_birth;
          newUserData.national_id = userData.national_id;
          newUserData.high_school_attended = userData.high_school_attended;
        }

        const userId = await ctx.db.insert("users", newUserData);

        if (userData.role === "student" && userData.security_question && userData.security_answer) {
          const { hash: answerHash } = await hashPassword(userData.security_answer.toLowerCase().trim());
          await ctx.db.insert("security_questions", {
            user_id: userId,
            question: userData.security_question,
            answer_hash: answerHash,
            created_at: Date.now(),
          });
        }

        if (userData.role === "school_admin" && school_id) {
          await ctx.db.patch(school_id, {
            created_by: userId,
          });
        }

        const resetToken = generateRandomToken();
        await ctx.db.insert("magic_links", {
          email: userData.email,
          token: resetToken,
          user_id: userId,
          expires_at: Date.now() + (24 * 60 * 60 * 1000),
          created_at: Date.now(),
          purpose: "password_reset",
        });

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: sessionResult.user.id,
          action: "user_created",
          resource_type: "users",
          resource_id: userId,
          description: `Admin bulk created user ${userData.name} (${userData.role})`,
        });

        results.push({
          success: true,
          userId,
          resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
          tempPassword,
          userData: {
            name: userData.name,
            email: userData.email,
            role: userData.role
          }
        });

      } catch (error: any) {
        results.push({
          success: false,
          error: error.message,
          userData: {
            name: userData.name,
            email: userData.email,
            role: userData.role
          }
        });
      }
    }

    return { results };
  },
});

export const exportUsers = mutation({
  args: {
    admin_token: v.string(),
    page: v.number(),
    limit: v.number(),
    role: v.optional(v.union(
      v.literal("all"),
      v.literal("student"),
      v.literal("school_admin"),
      v.literal("volunteer"),
      v.literal("admin")
    )),
    status: v.optional(v.union(
      v.literal("all"),
      v.literal("active"),
      v.literal("inactive"),
      v.literal("banned")
    )),
    verified: v.optional(v.union(
      v.literal("all"),
      v.literal("verified"),
      v.literal("pending")
    )),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { role, status, verified, page, limit } = args;

    let usersQuery;

    if (role && role !== "all") {
      if (status && status !== "all") {
        usersQuery = ctx.db
          .query("users")
          .withIndex("by_role_status", (q) => q.eq("role", role).eq("status", status));
      } else {
        usersQuery = ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", role));
      }
    } else if (status && status !== "all") {
      usersQuery = ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", status));
    } else if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      usersQuery = ctx.db
        .query("users")
        .withIndex("by_verified", (q) => q.eq("verified", isVerified));
    } else {
      usersQuery = ctx.db.query("users");
    }

    let allUsers = await usersQuery.collect();

    if (role && role !== "all") {
      allUsers = allUsers.filter(u => u.role === role);
    }

    if (status && status !== "all") {
      allUsers = allUsers.filter(u => u.status === status);
    }

    if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      allUsers = allUsers.filter(u => u.verified === isVerified);
    }

    const totalCount = allUsers.length;

    const sortedUsers = allUsers.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    const usersWithSchools = await Promise.all(
      paginatedUsers.map(async (user) => {
        let school = null;
        if (user.school_id) {
          school = await ctx.db.get(user.school_id);
        }

        return {
          ...user,
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
      totalCount,
      hasMore: endIndex < totalCount,
      nextPage: endIndex < totalCount ? page + 1 : null,
    };
  },
});

export const generateResetLink = mutation({
  args: {
    admin_token: v.string(),
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.verified || user.status !== "inactive") {
      throw new Error("Reset links can only be generated for verified inactive users");
    }

    const existingLinks = await ctx.db
      .query("magic_links")
      .withIndex("by_email_purpose", (q) => q.eq("email", user.email).eq("purpose", "password_reset"))
      .collect();

    for (const link of existingLinks) {
      await ctx.db.delete(link._id);
    }

    const resetToken = generateRandomToken();
    await ctx.db.insert("magic_links", {
      email: user.email,
      token: resetToken,
      user_id: args.user_id,
      expires_at: Date.now() + (24 * 60 * 60 * 1000),
      created_at: Date.now(),
      purpose: "password_reset",
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "user_updated",
      resource_type: "users",
      resource_id: args.user_id,
      description: `Admin generated reset link for user ${user.name}`,
    });

    return {
      success: true,
      resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
  },
});

export const updateSafeguardingCertificate = mutation({
  args: {
    user_id: v.id("users"),
    safeguarding_certificate: v.id("_storage"),
  },
  handler: async (ctx, args) => {

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "volunteer") {
      throw new Error("Only volunteers can update safeguarding certificates");
    }

    await ctx.db.patch(args.user_id, {
      safeguarding_certificate: args.safeguarding_certificate,
      updated_at: Date.now(),
    });

    try {
      await ctx.runMutation(internal.functions.audit.createAuditLog, {
        user_id: args.user_id,
        action: "user_updated",
        resource_type: "users",
        resource_id: args.user_id,
        description: `Volunteer ${user.name} updated safeguarding certificate`,
      });
    } catch (error) {
      console.error("Failed to create audit log:", error);
    }

    return { success: true };
  },
});
