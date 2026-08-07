import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { notificationPool } from "../lib/pools";

export const createNotification = mutation({
  args: {
    token: v.string(),
    user_id: v.id("users"),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("tournament"),
      v.literal("debate"),
      v.literal("result"),
      v.literal("system"),
      v.literal("auth")
    ),
    related_id: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    send_push: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const expires_at = args.expires_at || Date.now() + (30 * 24 * 60 * 60 * 1000);

    const notificationId = await ctx.db.insert("notifications", {
      user_id: args.user_id,
      title: args.title,
      message: args.message,
      type: args.type,
      related_id: args.related_id,
      is_read: false,
      expires_at,
      sent_via_email: false,
      sent_via_push: false,
      sent_via_sms: false,
      created_at: Date.now(),
    });

    if (args.send_push) {
      await notificationPool.enqueueAction(ctx, internal.functions.alerts.sendPushToUser, {
        user_id: args.user_id,
        notification_id: notificationId,
        title: args.title,
        message: args.message,
        type: args.type,
        related_id: args.related_id,
      });
    }

    return notificationId;
  },
});

export const sendBulkNotifications = mutation({
  args: {
    token: v.string(),
    user_ids: v.array(v.id("users")),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("tournament"),
      v.literal("debate"),
      v.literal("result"),
      v.literal("system"),
      v.literal("auth")
    ),
    related_id: v.optional(v.string()),
    send_push: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const notifications = await Promise.all(
      args.user_ids.map((user_id) =>
        ctx.db.insert("notifications", {
          user_id,
          title: args.title,
          message: args.message,
          type: args.type,
          related_id: args.related_id,
          is_read: false,
          expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000),
          sent_via_email: false,
          sent_via_push: false,
          sent_via_sms: false,
          created_at: Date.now(),
        })
      )
    );

    if (args.send_push) {
      // The pool caps how many are in flight, so the previous hand-rolled
      // stagger is no longer needed.
      await notificationPool.enqueueActionBatch(
        ctx,
        internal.functions.alerts.sendPushToUser,
        args.user_ids.map((user_id, index) => ({
          notification_id: notifications[index],
          user_id,
          title: args.title,
          message: args.message,
          type: args.type,
          related_id: args.related_id,
        }))
      );
    }

    return { created: notifications.length };
  },
});

/**
 * Notifies a known set of users, for events the system raises itself rather
 * than a signed-in person: a round closing, a motion being released. There is
 * no session to verify, so the caller must already have decided who to reach.
 */
export const notifyUsers = internalMutation({
  args: {
    user_ids: v.array(v.id("users")),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("tournament"),
      v.literal("debate"),
      v.literal("result"),
      v.literal("system"),
      v.literal("auth")
    ),
    related_id: v.optional(v.string()),
    send_push: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ created: number }> => {
    const unique = Array.from(new Set(args.user_ids));
    const now = Date.now();

    const notificationIds = await Promise.all(
      unique.map((user_id) =>
        ctx.db.insert("notifications", {
          user_id,
          title: args.title,
          message: args.message,
          type: args.type,
          related_id: args.related_id,
          is_read: false,
          expires_at: now + 30 * 24 * 60 * 60 * 1000,
          sent_via_email: false,
          sent_via_push: false,
          sent_via_sms: false,
          created_at: now,
        })
      )
    );

    if (args.send_push !== false) {
      // The pool caps how many are in flight, so a whole tournament can be
      // notified at once without bursting the push service.
      await notificationPool.enqueueActionBatch(
        ctx,
        internal.functions.alerts.sendPushToUser,
        unique.map((user_id, index) => ({
          user_id,
          notification_id: notificationIds[index],
          title: args.title,
          message: args.message,
          type: args.type,
          related_id: args.related_id,
        }))
      );
    }

    return { created: unique.length };
  },
});

export const sendTournamentNotification = internalMutation({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("tournament"),
      v.literal("debate"),
      v.literal("result"),
      v.literal("system")
    ),
    send_push: v.optional(v.boolean()),
    target_roles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ created: number }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const userIds = new Set<Id<"users">>();

    for (const team of teams) {
      for (const memberId of team.members) {
        userIds.add(memberId);
      }
    }

    if (args.target_roles && args.target_roles.length > 0) {
      const users = await Promise.all(
        Array.from(userIds).map(id => ctx.db.get(id))
      );

      const filteredUserIds = users
        .filter(user => user && args.target_roles!.includes(user.role))
        .map(user => user!._id);

      userIds.clear();
      filteredUserIds.forEach(id => userIds.add(id));
    }

    return await ctx.runMutation(api.functions.notifications.sendBulkNotifications, {
      token: args.token,
      user_ids: Array.from(userIds),
      title: args.title,
      message: args.message,
      type: args.type,
      related_id: args.tournament_id,
      send_push: args.send_push,
    });
  },
});


export const getUserNotifications = mutation({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
    is_read: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"notifications">[]> => {
    let sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    let currentToken = args.token;

    if (!sessionResult.valid) {
      try {
        const refreshResult = await ctx.runMutation(internal.functions.auth.refreshToken, {
          token: args.token,
        });

        if (refreshResult.success) {
          currentToken = refreshResult.token;
          sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
            token: currentToken,
          });
        }
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        throw new Error("Authentication required");
      }
    }

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const limit = args.limit || 20;

    let query = ctx.db
      .query("notifications")
      .withIndex("by_user_id", (q) => q.eq("user_id", sessionResult.user.id));

    if (args.is_read !== undefined) {
      query = query.filter((q) => q.eq(q.field("is_read"), args.is_read));
    }

    return await query
      .filter((q) => q.gt(q.field("expires_at"), Date.now()))
      .order("desc")
      .take(limit);
  },
});

export const getUnreadCount = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<number> => {
    let sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    let currentToken = args.token;

    if (!sessionResult.valid) {
      try {
        const refreshResult = await ctx.runMutation(internal.functions.auth.refreshToken, {
          token: args.token,
        });

        if (refreshResult.success) {
          currentToken = refreshResult.token;
          sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
            token: currentToken,
          });
        }
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        throw new Error("Authentication required");
      }
    }

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const count = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_is_read", (q) =>
        q.eq("user_id", sessionResult.user.id).eq("is_read", false)
      )
      .filter((q) => q.gt(q.field("expires_at"), Date.now()))
      .collect();

    return count.length;
  },
});

export const markAsRead = mutation({
  args: {
    token: v.string(),
    notification_id: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const notification = await ctx.db.get(args.notification_id);

    if (!notification || notification.user_id !== sessionResult.user.id) {
      throw new Error("Notification not found or unauthorized");
    }

    await ctx.db.patch(args.notification_id, {
      is_read: true,
    });

    return { success: true };
  },
});

export const markAllAsRead = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{ count: number }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_is_read", (q) =>
        q.eq("user_id", sessionResult.user.id).eq("is_read", false)
      )
      .collect();

    await Promise.all(
      notifications.map((notification) =>
        ctx.db.patch(notification._id, { is_read: true })
      )
    );

    return { count: notifications.length };
  },
});

export const storePushSubscription = mutation({
  args: {
    token: v.string(),
    subscription: v.object({
      endpoint: v.string(),
      keys: v.object({
        p256dh: v.string(),
        auth: v.string(),
      }),
    }),
    device_info: v.optional(v.object({
      user_agent: v.optional(v.string()),
      platform: v.optional(v.string()),
      device_name: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<Id<"push_subscriptions">> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.subscription.endpoint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        user_id: sessionResult.user.id,
        p256dh: args.subscription.keys.p256dh,
        auth: args.subscription.keys.auth,
        device_info: args.device_info,
        is_active: true,
        last_used_at: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("push_subscriptions", {
      user_id: sessionResult.user.id,
      endpoint: args.subscription.endpoint,
      p256dh: args.subscription.keys.p256dh,
      auth: args.subscription.keys.auth,
      device_info: args.device_info,
      is_active: true,
      created_at: Date.now(),
      last_used_at: Date.now(),
    });
  },
});

export const getUserPushSubscriptions = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("push_subscriptions")
      .withIndex("by_user_id_active", (q) =>
        q.eq("user_id", args.user_id).eq("is_active", true)
      )
      .collect();
  },
});

export const deactivateSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription) {
      await ctx.db.patch(subscription._id, {
        is_active: false,
      });
    }

    return { success: true };
  },
});

export const removeUserSubscription = mutation({
  args: {
    token: v.string(),
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.user || !sessionResult.valid) {
      throw new Error("Authentication required");
    }

    const subscription = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription && subscription.user_id === sessionResult.user.id) {
      await ctx.db.delete(subscription._id);
      return { success: true };
    }

    return { success: false, error: "Subscription not found" };
  },
});

export const updatePushStatus = mutation({
  args: {
    notification_id: v.id("notifications"),
    sent: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notification_id, {
      sent_via_push: args.sent,
    });
  },
});

export const cleanupExpiredNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting cleanup of expired notifications...");

    const expired = await ctx.db
      .query("notifications")
      .withIndex("by_expires_at", (q) => q.lt("expires_at", Date.now()))
      .collect();

    await Promise.all(
      expired.map((notification) => ctx.db.delete(notification._id))
    );

    const result = {
      deleted: expired.length,
      cleanedAt: new Date().toISOString(),
    };

    console.log("Notifications cleanup completed:", result);

    return result;
  },
});

export const cleanupInactiveSubscriptions = internalMutation({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffDays = args.days || 30;
    const cutoffTime = Date.now() - (cutoffDays * 24 * 60 * 60 * 1000);

    console.log(`Starting cleanup of inactive subscriptions older than ${cutoffDays} days...`);

    const inactive = await ctx.db
      .query("push_subscriptions")
      .filter((q) =>
        q.or(
          q.eq(q.field("is_active"), false),
          q.lt(q.field("last_used_at"), cutoffTime)
        )
      )
      .collect();

    await Promise.all(
      inactive.map((subscription) => ctx.db.delete(subscription._id))
    );

    const result = {
      deleted: inactive.length,
      cutoffDays,
      cleanedAt: new Date().toISOString(),
    };

    console.log("Subscriptions cleanup completed:", result);

    return result;
  },
});
