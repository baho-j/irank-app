import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

const operationValidator = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete")
);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("conflict")
);

async function requireUser(ctx: any, token: string): Promise<{ id: Id<"users">; role: string }> {
  const sessionResult: { valid: boolean; user?: { id: Id<"users">; role: string } } =
    await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, { token });

  if (!sessionResult.valid || !sessionResult.user) {
    throw new Error("Authentication required");
  }

  return sessionResult.user;
}

/**
 * Records what a device sent while it was offline.
 *
 * The durable outbox on the device is the queue; this is the server's account
 * of what arrived, so a coordinator can see which devices are still holding
 * unsynced work and which entries failed or conflicted rather than having to
 * infer it from missing data.
 */
export const recordSync = mutation({
  args: {
    token: v.string(),
    device_id: v.string(),
    entries: v.array(
      v.object({
        table_name: v.string(),
        record_id: v.string(),
        operation: operationValidator,
        status: statusValidator,
        local_timestamp: v.number(),
        error: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ recorded: number }> => {
    const user = await requireUser(ctx, args.token);
    const now = Date.now();

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("sync_logs")
        .withIndex("by_table_name_record_id", (q) =>
          q.eq("table_name", entry.table_name).eq("record_id", entry.record_id)
        )
        .first();

      // A retried entry updates its own row rather than adding another, so the
      // log reflects outcomes and not attempts.
      if (existing && existing.device_id === args.device_id) {
        await ctx.db.patch(existing._id, {
          operation: entry.operation,
          status: entry.status,
          local_timestamp: entry.local_timestamp,
          server_timestamp: now,
        });
        continue;
      }

      await ctx.db.insert("sync_logs", {
        user_id: user.id as Id<"users">,
        device_id: args.device_id,
        table_name: entry.table_name,
        record_id: entry.record_id,
        operation: entry.operation,
        status: entry.status,
        local_timestamp: entry.local_timestamp,
        server_timestamp: now,
      });
    }

    return { recorded: args.entries.length };
  },
});

export const getSyncStatus = query({
  args: {
    token: v.string(),
    device_id: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    counts: { pending: number; completed: number; failed: number; conflict: number };
    total: number;
    needs_attention: number;
    devices: Array<{ device_id: string; entries: number; last_seen: number }>;
  }> => {
    const user = await requireUser(ctx, args.token);

    const logs: Doc<"sync_logs">[] = args.device_id
      ? await ctx.db
        .query("sync_logs")
        .withIndex("by_user_id_device_id", (q) =>
          q.eq("user_id", user.id as Id<"users">).eq("device_id", args.device_id!)
        )
        .collect()
      : await ctx.db
        .query("sync_logs")
        .withIndex("by_user_id", (q) => q.eq("user_id", user.id as Id<"users">))
        .collect();

    const byStatus = {
      pending: 0,
      completed: 0,
      failed: 0,
      conflict: 0,
    };

    const devices = new Map<string, { entries: number; last_seen: number }>();

    for (const log of logs) {
      byStatus[log.status] += 1;

      const device = devices.get(log.device_id) ?? { entries: 0, last_seen: 0 };
      device.entries += 1;
      device.last_seen = Math.max(device.last_seen, log.server_timestamp ?? log.local_timestamp);
      devices.set(log.device_id, device);
    }

    return {
      counts: byStatus,
      total: logs.length,
      needs_attention: byStatus.failed + byStatus.conflict,
      devices: [...devices.entries()].map(([device_id, detail]) => ({
        device_id,
        ...detail,
      })),
    };
  },
});

/** Entries a coordinator must look at, newest first. */
export const getUnresolvedSyncEntries = query({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"sync_logs">[]> => {
    const user = await requireUser(ctx, args.token);

    const logs = await ctx.db
      .query("sync_logs")
      .withIndex("by_user_id", (q) => q.eq("user_id", user.id as Id<"users">))
      .collect();

    return logs
      .filter((log) => log.status === "failed" || log.status === "conflict")
      .sort(
        (a, b) =>
          (b.server_timestamp ?? b.local_timestamp) - (a.server_timestamp ?? a.local_timestamp)
      )
      .slice(0, args.limit ?? 50);
  },
});
