"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import {
  sendBulkWebPush,
  NotificationPayload,
  PushSubscriptionData,
} from "../lib/push_service";

/**
 * Delivers one user's push. Internal because it is only ever reached through
 * the notification pool, which bounds how many are in flight at once.
 */
export const sendPushToUser = internalAction({
  args: {
    user_id: v.id("users"),
    notification_id: v.id("notifications"),
    title: v.string(),
    message: v.string(),
    type: v.string(),
    related_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.runQuery(api.functions.notifications.getUserPushSubscriptions, {
      user_id: args.user_id,
    });

    if (subscriptions.length === 0) {
      console.log("No push subscriptions for user:", args.user_id);
      return { sent: false, reason: "No subscriptions" };
    }

    const pushSubscriptions: PushSubscriptionData[] = subscriptions.map((sub: { endpoint: any; p256dh: any; auth: any; }) => ({
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    }));

    const payload: NotificationPayload = {
      title: args.title,
      body: args.message,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      tag: `${args.type}-${args.notification_id}`,
      data: {
        notification_id: args.notification_id,
        type: args.type,
        related_id: args.related_id,
        url: getNotificationUrl(args.type, args.related_id),
      },
      actions: [
        {
          action: "view",
          title: "View",
        },
        {
          action: "dismiss",
          title: "Dismiss"
        }
      ],
      requireInteraction: args.type === "tournament" || args.type === "debate",
    };

    const results = await sendBulkWebPush(pushSubscriptions, payload);

    let successful = 0;
    let failed = 0;

    for (const result of results) {
      if (result.success) {
        successful++;
      } else {
        failed++;

        if (result.statusCode === 410) {
          await ctx.runMutation(api.functions.notifications.deactivateSubscription, {
            endpoint: result.subscription.endpoint
          });
        }
      }
    }

    await ctx.runMutation(api.functions.notifications.updatePushStatus, {
      notification_id: args.notification_id,
      sent: successful > 0,
    });

    return {
      sent: successful > 0,
      successful,
      failed,
      total: results.length
    };
  },
});

function getNotificationUrl(type: string, related_id?: string): string {
  switch (type) {
    case "tournament":
      return related_id ? `/tournaments/${related_id}` : "/tournaments";
    case "debate":
      return related_id ? `/debates/${related_id}` : "/debates";
    case "result":
      return "/results";
    case "system":
      return "/settings";
    case "auth":
      return "/profile";
    default:
      return "/dashboard";
  }
}
