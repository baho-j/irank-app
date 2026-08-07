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

export const getStudents = query({
  args: {
    school_admin_token: v.string(),
    search: v.optional(v.string()),
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
    grade: v.optional(v.string()),
    page: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<{
    students: Array<Doc<"users"> & { has_debated: boolean }>;
    totalCount: number;
    hasMore: boolean;
    nextPage: number | null;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const { search, status, verified, grade, page, limit } = args;

    if (search && search.trim() !== "") {
      const searchResults = await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) => {
          let query = q.search("name", search)
            .eq("role", "student")
            .eq("school_id", schoolAdmin.school_id!);

          if (status && status !== "all") query = query.eq("status", status);
          if (verified && verified !== "all") {
            query = query.eq("verified", verified === "verified");
          }
          return query;
        })
        .collect();

      let filteredResults = searchResults;
      if (grade && grade !== "all") {
        filteredResults = searchResults.filter(student => student.grade === grade);
      }

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedResults = filteredResults.slice(startIndex, endIndex);

      const studentsWithDebateStatus = await Promise.all(
        paginatedResults.map(async (student) => {

          const allTeams = await ctx.db.query("teams").collect();

          const teams = allTeams.filter((team) =>
            team.members.includes(student._id)
          );

          let hasDebated = false;
          for (const team of teams) {
            const debates = await ctx.db
              .query("debates")
              .filter((q) =>
                q.or(
                  q.eq(q.field("proposition_team_id"), team._id),
                  q.eq(q.field("opposition_team_id"), team._id)
                )
              )
              .filter((q) => q.eq(q.field("status"), "completed"))
              .first();

            if (debates) {
              hasDebated = true;
              break;
            }
          }

          return {
            ...student,
            has_debated: hasDebated,
          };
        })
      );

      return {
        students: studentsWithDebateStatus,
        totalCount: filteredResults.length,
        hasMore: endIndex < filteredResults.length,
        nextPage: endIndex < filteredResults.length ? page + 1 : null,
      };
    }

    let studentsQuery = ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", schoolAdmin.school_id!).eq("role", "student")
      );

    let allStudents = await studentsQuery.collect();

    if (status && status !== "all") {
      allStudents = allStudents.filter(s => s.status === status);
    }

    if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      allStudents = allStudents.filter(s => s.verified === isVerified);
    }

    if (grade && grade !== "all") {
      allStudents = allStudents.filter(s => s.grade === grade);
    }

    const totalCount = allStudents.length;

    const sortedStudents = allStudents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStudents = sortedStudents.slice(startIndex, endIndex);

    const studentsWithDebateStatus = await Promise.all(
      paginatedStudents.map(async (student) => {

        const allTeams = await ctx.db.query("teams").collect();

        const teams = allTeams.filter((team) =>
          team.members.includes(student._id)
        );


        let hasDebated = false;
        for (const team of teams) {
          const debates = await ctx.db
            .query("debates")
            .filter((q) =>
              q.or(
                q.eq(q.field("proposition_team_id"), team._id),
                q.eq(q.field("opposition_team_id"), team._id)
              )
            )
            .filter((q) => q.eq(q.field("status"), "completed"))
            .first();

          if (debates) {
            hasDebated = true;
            break;
          }
        }

        return {
          ...student,
          has_debated: hasDebated,
        };
      })
    );

    return {
      students: studentsWithDebateStatus,
      totalCount,
      hasMore: endIndex < totalCount,
      nextPage: endIndex < totalCount ? page + 1 : null,
    };
  },
});

export const updateStudentStatus = mutation({
  args: {
    school_admin_token: v.string(),
    student_id: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("banned")
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const student = await ctx.db.get(args.student_id);
    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error("Can only update student accounts");
    }

    if (student.school_id !== schoolAdmin.school_id) {
      throw new Error("Can only update students from your school");
    }

    const previousStatus = student.status;

    await ctx.db.patch(args.student_id, {
      status: args.status,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_updated",
      resource_type: "users",
      resource_id: args.student_id,
      description: `School admin changed student ${student.name} status from ${previousStatus} to ${args.status}`,
      previous_state: JSON.stringify({ status: previousStatus }),
      new_state: JSON.stringify({ status: args.status }),
    });

    await ctx.db.insert("notifications", {
      user_id: args.student_id,
      title: "Account Status Updated",
      message: `Your account status has been changed to ${args.status} by your school administrator.`,
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const verifyStudent = mutation({
  args: {
    school_admin_token: v.string(),
    student_id: v.id("users"),
    verified: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const student = await ctx.db.get(args.student_id);
    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error("Can only verify student accounts");
    }

    if (student.school_id !== schoolAdmin.school_id) {
      throw new Error("Can only verify students from your school");
    }

    await ctx.db.patch(args.student_id, {
      verified: args.verified,
      status: args.verified ? "active" : student.status,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_verified",
      resource_type: "users",
      resource_id: args.student_id,
      description: `School admin ${args.verified ? 'verified' : 'unverified'} student ${student.name}`,
    });

    await ctx.db.insert("notifications", {
      user_id: args.student_id,
      title: args.verified ? "Account Verified" : "Account Verification Removed",
      message: args.verified
        ? "Your account has been verified by your school administrator."
        : "Your account verification has been removed by your school administrator.",
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const deleteStudent = mutation({
  args: {
    school_admin_token: v.string(),
    student_id: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const student = await ctx.db.get(args.student_id);
    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error("Can only delete student accounts");
    }

    if (student.school_id !== schoolAdmin.school_id) {
      throw new Error("Can only delete students from your school");
    }

    const studentTeams: Doc<"teams">[] = [];
    for await (const team of ctx.db.query("teams")) {
      if (team.members.includes(args.student_id)) {
        studentTeams.push(team);
      }
    }

    if (studentTeams.length > 0) {
      throw new Error("Cannot delete student who is part of tournament teams. Please remove from teams first.");
    }

    if (student.profile_image) {
      try {
        await ctx.storage.delete(student.profile_image);
      } catch (error) {
        console.log("Could not delete profile image:", error);
      }
    }

    const securityQuestion = await ctx.db
      .query("security_questions")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.student_id))
      .first();

    if (securityQuestion) {
      await ctx.db.delete(securityQuestion._id);
    }

    await ctx.db.delete(args.student_id);

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_deleted",
      resource_type: "users",
      resource_id: args.student_id,
      description: `School admin deleted student ${student.name} (${student.email})`,
      previous_state: JSON.stringify({
        name: student.name,
        email: student.email,
        grade: student.grade,
      }),
    });

    return { success: true };
  },
});

export const bulkUpdateStudents = mutation({
  args: {
    school_admin_token: v.string(),
    student_ids: v.array(v.id("users")),
    action: v.union(
      v.literal("verify"),
      v.literal("unverify"),
      v.literal("activate"),
      v.literal("deactivate"),
      v.literal("ban")
    ),
  },
  handler: async (ctx, args): Promise<{
    results: Array<{
      studentId: string;
      success: boolean;
      error?: string;
    }>;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const results = [];

    for (const studentId of args.student_ids) {
      try {
        const student = await ctx.db.get(studentId);
        if (!student) {
          results.push({ studentId, success: false, error: "Student not found" });
          continue;
        }

        if (student.role !== "student") {
          results.push({ studentId, success: false, error: "Not a student account" });
          continue;
        }

        if (student.school_id !== schoolAdmin.school_id) {
          results.push({ studentId, success: false, error: "Student not from your school" });
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
            notificationMessage = "Your account has been verified by your school administrator.";
            break;
          case "unverify":
            updateData.verified = false;
            notificationTitle = "Account Verification Removed";
            notificationMessage = "Your account verification has been removed by your school administrator.";
            break;
          case "activate":
            updateData.status = "active";
            notificationTitle = "Account Activated";
            notificationMessage = "Your account has been activated by your school administrator.";
            break;
          case "deactivate":
            updateData.status = "inactive";
            notificationTitle = "Account Deactivated";
            notificationMessage = "Your account has been deactivated by your school administrator.";
            break;
          case "ban":
            updateData.status = "banned";
            notificationTitle = "Account Banned";
            notificationMessage = "Your account has been banned by your school administrator.";
            break;
        }

        await ctx.db.patch(studentId, updateData);

        await ctx.db.insert("notifications", {
          user_id: studentId,
          title: notificationTitle,
          message: notificationMessage,
          type: "system",
          is_read: false,
          expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
          created_at: Date.now(),
        });

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: schoolAdmin.id,
          action: "user_updated",
          resource_type: "users",
          resource_id: studentId,
          description: `School admin performed bulk action ${args.action} on student ${student.name}`,
        });

        results.push({ studentId, success: true });
      } catch (error: any) {
        results.push({ studentId, success: false, error: error.message });
      }
    }

    return { results };
  },
});

export const createStudent = mutation({
  args: {
    school_admin_token: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    gender: v.optional(v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("non_binary")
    )),
    grade: v.string(),
    security_question: v.string(),
    security_answer: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    studentId: Id<"users">;
    resetLink: string;
    tempPassword: string;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
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

    const studentData = {
      name: args.name,
      email: args.email,
      phone: args.phone,
      password_hash: passwordHash.hash,
      password_salt: passwordHash.salt,
      role: "student" as const,
      school_id: schoolAdmin.school_id,
      status: "inactive" as const,
      verified: true,
      gender: args.gender,
      grade: args.grade,
      created_at: Date.now(),
      failed_login_attempts: 0,
      biometric_enabled: false,
    };

    const studentId = await ctx.db.insert("users", studentData);

    const { hash: answerHash } = await hashPassword(args.security_answer.toLowerCase().trim());
    await ctx.db.insert("security_questions", {
      user_id: studentId,
      question: args.security_question,
      answer_hash: answerHash,
      created_at: Date.now(),
    });

    const resetToken = generateRandomToken();
    await ctx.db.insert("magic_links", {
      email: args.email,
      token: resetToken,
      user_id: studentId,
      expires_at: Date.now() + (24 * 60 * 60 * 1000),
      created_at: Date.now(),
      purpose: "password_reset",
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_created",
      resource_type: "users",
      resource_id: studentId,
      description: `School admin created student ${args.name} (${args.email}) in grade ${args.grade}`,
    });

    await ctx.db.insert("notifications", {
      user_id: studentId,
      title: "Welcome to iRankHub",
      message: "Your student account has been created by your school administrator. Please check your email for login instructions.",
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return {
      success: true,
      studentId,
      resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
      tempPassword
    };
  },
});

export const bulkCreateStudents = mutation({
  args: {
    school_admin_token: v.string(),
    students: v.array(v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      gender: v.optional(v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("non_binary")
      )),
      grade: v.string(),
      security_question: v.string(),
      security_answer: v.string(),
    }))
  },
  handler: async (ctx, args): Promise<{
    results: Array<{
      success: boolean;
      userId?: Id<"users">;
      resetLink?: string;
      tempPassword?: string;
      error?: string;
      userData: {
        name: string;
        email: string;
        grade: string;
      };
    }>;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const results = [];

    for (const studentData of args.students) {
      try {

        const existingUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", studentData.email))
          .first();

        if (existingUser) {
          results.push({
            success: false,
            error: "Email already exists",
            userData: {
              name: studentData.name,
              email: studentData.email,
              grade: studentData.grade
            }
          });
          continue;
        }

        if (studentData.phone) {
          const existingPhone = await ctx.db
            .query("users")
            .withIndex("by_phone", (q) => q.eq("phone", studentData.phone))
            .first();

          if (existingPhone) {
            results.push({
              success: false,
              error: "Phone number already exists",
              userData: {
                name: studentData.name,
                email: studentData.email,
                grade: studentData.grade
              }
            });
            continue;
          }
        }

        if (!studentData.grade || !studentData.security_question || !studentData.security_answer) {
          results.push({
            success: false,
            error: "Missing required fields (grade, security_question, security_answer)",
            userData: {
              name: studentData.name,
              email: studentData.email,
              grade: studentData.grade || "N/A"
            }
          });
          continue;
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await hashPassword(tempPassword);

        const newStudentData = {
          name: studentData.name,
          email: studentData.email,
          phone: studentData.phone,
          password_hash: passwordHash.hash,
          password_salt: passwordHash.salt,
          role: "student" as const,
          school_id: schoolAdmin.school_id,
          status: "inactive" as const,
          verified: true,
          gender: studentData.gender,
          grade: studentData.grade,
          created_at: Date.now(),
          failed_login_attempts: 0,
          biometric_enabled: false,
        };

        const studentId = await ctx.db.insert("users", newStudentData);

        const { hash: answerHash } = await hashPassword(studentData.security_answer.toLowerCase().trim());
        await ctx.db.insert("security_questions", {
          user_id: studentId,
          question: studentData.security_question,
          answer_hash: answerHash,
          created_at: Date.now(),
        });

        const resetToken = generateRandomToken();
        await ctx.db.insert("magic_links", {
          email: studentData.email,
          token: resetToken,
          user_id: studentId,
          expires_at: Date.now() + (24 * 60 * 60 * 1000),
          created_at: Date.now(),
          purpose: "password_reset",
        });

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: schoolAdmin.id,
          action: "user_created",
          resource_type: "users",
          resource_id: studentId,
          description: `School admin bulk created student ${studentData.name} in grade ${studentData.grade}`,
        });

        results.push({
          success: true,
          studentId,
          resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
          tempPassword,
          userData: {
            name: studentData.name,
            email: studentData.email,
            grade: studentData.grade
          }
        });

      } catch (error: any) {
        results.push({
          success: false,
          error: error.message,
          userData: {
            name: studentData.name,
            email: studentData.email,
            grade: studentData.grade || "N/A"
          }
        });
      }
    }

    return { results };
  },
});

export const exportStudents = mutation({
  args: {
    school_admin_token: v.string(),
    page: v.number(),
    limit: v.number(),
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
    grade: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    students: Array<Doc<"users"> & {
      school: {
        id: Id<"schools">;
        name: string;
        type: string;
      } | null;
    }>;
    totalCount: number;
    hasMore: boolean;
    nextPage: number | null;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const { status, verified, grade, page, limit } = args;

    let studentsQuery = ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", schoolAdmin.school_id!).eq("role", "student")
      );

    let allStudents = await studentsQuery.collect();

    if (status && status !== "all") {
      allStudents = allStudents.filter(s => s.status === status);
    }

    if (verified && verified !== "all") {
      const isVerified = verified === "verified";
      allStudents = allStudents.filter(s => s.verified === isVerified);
    }

    if (grade && grade !== "all") {
      allStudents = allStudents.filter(s => s.grade === grade);
    }

    const totalCount = allStudents.length;

    const sortedStudents = allStudents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStudents = sortedStudents.slice(startIndex, endIndex);

    const school = await ctx.db.get(schoolAdmin.school_id);

    const studentsWithSchool = paginatedStudents.map(student => ({
      ...student,
      school: school ? {
        id: school._id,
        name: school.name,
        type: school.type,
      } : null,
    }));

    return {
      students: studentsWithSchool,
      totalCount,
      hasMore: endIndex < totalCount,
      nextPage: endIndex < totalCount ? page + 1 : null,
    };
  },
});

export const generateStudentResetLink = mutation({
  args: {
    school_admin_token: v.string(),
    student_id: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    resetLink: string;
    expiresAt: number;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const student = await ctx.db.get(args.student_id);
    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error("Can only generate reset links for students");
    }

    if (student.school_id !== schoolAdmin.school_id) {
      throw new Error("Can only generate reset links for students from your school");
    }

    if (!student.verified || student.status !== "inactive") {
      throw new Error("Reset links can only be generated for verified inactive students");
    }

    const existingLinks = await ctx.db
      .query("magic_links")
      .withIndex("by_email_purpose", (q) => q.eq("email", student.email).eq("purpose", "password_reset"))
      .collect();

    for (const link of existingLinks) {
      await ctx.db.delete(link._id);
    }

    const resetToken = generateRandomToken();
    await ctx.db.insert("magic_links", {
      email: student.email,
      token: resetToken,
      user_id: args.student_id,
      expires_at: Date.now() + (24 * 60 * 60 * 1000),
      created_at: Date.now(),
      purpose: "password_reset",
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_updated",
      resource_type: "users",
      resource_id: args.student_id,
      description: `School admin generated reset link for student ${student.name}`,
    });

    return {
      success: true,
      resetLink: `${process.env.FRONTEND_SITE_URL}/reset-password?token=${resetToken}`,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
  },
});

export const getGradesList = query({
  args: {
    school_admin_token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    grades: string[];
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const students = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", schoolAdmin.school_id!).eq("role", "student")
      )
      .collect();

    const grades = Array.from(
      new Set(
        students
          .map(s => s.grade)
          .filter((g): g is string => typeof g === "string")
      )
    ).sort();

    return { grades };
  },
});

export const getStudentStats = query({
  args: {
    school_admin_token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    bannedStudents: number;
    verifiedStudents: number;
    pendingStudents: number;
    studentsWithDebates: number;
    studentsWithoutDebates: number;
    gradeDistribution: Record<string, number>;
  }> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const students = await ctx.db
      .query("users")
      .withIndex("by_school_id_role", (q) =>
        q.eq("school_id", schoolAdmin.school_id!).eq("role", "student")
      )
      .collect();

    const totalStudents = students.length;
    const activeStudents = students.filter(s => s.status === "active").length;
    const inactiveStudents = students.filter(s => s.status === "inactive").length;
    const bannedStudents = students.filter(s => s.status === "banned").length;
    const verifiedStudents = students.filter(s => s.verified).length;
    const pendingStudents = students.filter(s => !s.verified).length;

    let studentsWithDebates = 0;
    for (const student of students) {
      const allTeams = await ctx.db.query("teams").collect();

      const teams = allTeams.filter((team) =>
        team.members.includes(student._id)
      );
      for (const team of teams) {
        const hasDebated = await ctx.db
          .query("debates")
          .filter((q) =>
            q.or(
              q.eq(q.field("proposition_team_id"), team._id),
              q.eq(q.field("opposition_team_id"), team._id)
            )
          )
          .filter((q) => q.eq(q.field("status"), "completed"))
          .first();

        if (hasDebated) {
          studentsWithDebates++;
          break;
        }
      }
    }

    const gradeDistribution: Record<string, number> = {};
    students.forEach(student => {
      if (student.grade) {
        gradeDistribution[student.grade] = (gradeDistribution[student.grade] || 0) + 1;
      }
    });

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      bannedStudents,
      verifiedStudents,
      pendingStudents,
      studentsWithDebates,
      studentsWithoutDebates: totalStudents - studentsWithDebates,
      gradeDistribution,
    };
  },
});

export const updateStudentGrade = mutation({
  args: {
    school_admin_token: v.string(),
    student_id: v.id("users"),
    grade: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const student = await ctx.db.get(args.student_id);
    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error("Can only update grade for student accounts");
    }

    if (student.school_id !== schoolAdmin.school_id) {
      throw new Error("Can only update students from your school");
    }

    const previousGrade = student.grade;

    await ctx.db.patch(args.student_id, {
      grade: args.grade,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: schoolAdmin.id,
      action: "user_updated",
      resource_type: "users",
      resource_id: args.student_id,
      description: `School admin changed student ${student.name} grade from ${previousGrade} to ${args.grade}`,
      previous_state: JSON.stringify({ grade: previousGrade }),
      new_state: JSON.stringify({ grade: args.grade }),
    });

    await ctx.db.insert("notifications", {
      user_id: args.student_id,
      title: "Grade Updated",
      message: `Your grade has been updated to ${args.grade} by your school administrator.`,
      type: "system",
      is_read: false,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const bulkUpdateStudentGrades = mutation({
  args: {
    school_admin_token: v.string(),
    updates: v.array(v.object({
      student_id: v.id("users"),
      grade: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<{
    results: Array<{
      studentId: Id<"users">;
      success: boolean;
      error?: string;
    }>;
  }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.school_admin_token,
    });

    if (!sessionResult.valid || sessionResult.user?.role !== "school_admin") {
      throw new Error("School admin access required");
    }

    const schoolAdmin = sessionResult.user;
    if (!schoolAdmin.school_id) {
      throw new Error("School admin must be associated with a school");
    }

    const results = [];

    for (const update of args.updates) {
      try {
        const student = await ctx.db.get(update.student_id);
        if (!student) {
          results.push({ studentId: update.student_id, success: false, error: "Student not found" });
          continue;
        }

        if (student.role !== "student") {
          results.push({ studentId: update.student_id, success: false, error: "Not a student account" });
          continue;
        }

        if (student.school_id !== schoolAdmin.school_id) {
          results.push({ studentId: update.student_id, success: false, error: "Student not from your school" });
          continue;
        }

        const previousGrade = student.grade;

        await ctx.db.patch(update.student_id, {
          grade: update.grade,
          updated_at: Date.now(),
        });

        await ctx.runMutation(internal.functions.audit.createAuditLog, {
          user_id: schoolAdmin.id,
          action: "user_updated",
          resource_type: "users",
          resource_id: update.student_id,
          description: `School admin bulk updated student ${student.name} grade from ${previousGrade} to ${update.grade}`,
        });

        await ctx.db.insert("notifications", {
          user_id: update.student_id,
          title: "Grade Updated",
          message: `Your grade has been updated to ${update.grade} by your school administrator.`,
          type: "system",
          is_read: false,
          expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
          created_at: Date.now(),
        });

        results.push({ studentId: update.student_id, success: true });
      } catch (error: any) {
        results.push({ studentId: update.student_id, success: false, error: error.message });
      }
    }

    return { results };
  },
});