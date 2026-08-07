import { v } from "convex/values";
import { internalMutation as rawInternalMutation } from "../_generated/server";
import { internalMutation as triggeredMutation } from "../lib/aggregates";
import {
  debatesByCreation,
  schoolsByCreation,
  tournamentsByCreation,
  usersByCreation,
} from "../lib/aggregates";

/**
 * Populates the aggregates from the rows that already exist.
 *
 * An aggregate starts empty. Until it has been backfilled every count reads
 * zero, which is worse than a slow answer because it looks like a real one.
 *
 * Run once per table after deploying, and again after any direct write in the
 * dashboard, which bypasses the triggers.
 */
const PAGE_SIZE = 200;

export const backfillUsers = rawInternalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ cursor: string | null; done: boolean }> => {
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });

    for (const doc of page.page) {
      await usersByCreation.insertIfDoesNotExist(ctx, doc);
    }

    return { cursor: page.continueCursor, done: page.isDone };
  },
});

export const backfillSchools = rawInternalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ cursor: string | null; done: boolean }> => {
    const page = await ctx.db
      .query("schools")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });

    for (const doc of page.page) {
      await schoolsByCreation.insertIfDoesNotExist(ctx, doc);
    }

    return { cursor: page.continueCursor, done: page.isDone };
  },
});

export const backfillTournaments = rawInternalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ cursor: string | null; done: boolean }> => {
    const page = await ctx.db
      .query("tournaments")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });

    for (const doc of page.page) {
      await tournamentsByCreation.insertIfDoesNotExist(ctx, doc);
    }

    return { cursor: page.continueCursor, done: page.isDone };
  },
});

export const backfillDebates = rawInternalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ cursor: string | null; done: boolean }> => {
    const page = await ctx.db
      .query("debates")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });

    for (const doc of page.page) {
      await debatesByCreation.insertIfDoesNotExist(ctx, doc);
    }

    return { cursor: page.continueCursor, done: page.isDone };
  },
});

/** Runs every table's backfill to completion. */
export const backfillAll = rawInternalMutation({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const counted: Record<string, number> = {};

    for (const [table, aggregate] of [
      ["users", usersByCreation],
      ["schools", schoolsByCreation],
      ["tournaments", tournamentsByCreation],
      ["debates", debatesByCreation],
    ] as const) {
      const docs = await ctx.db.query(table).collect();

      for (const doc of docs) {
        await aggregate.insertIfDoesNotExist(ctx, doc as any);
      }

      counted[table] = docs.length;
    }

    return counted;
  },
});

/**
 * Empties the aggregates. Use before a backfill when the counts have drifted
 * — a direct edit in the dashboard does not fire the triggers.
 */
export const clearAggregates = rawInternalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await usersByCreation.clear(ctx);
    await schoolsByCreation.clear(ctx);
    await tournamentsByCreation.clear(ctx);
    await debatesByCreation.clear(ctx);

    return null;
  },
});

/**
 * Deletes a school through the trigger-wrapped mutation, so the aggregate is
 * updated as it would be anywhere else in the app. Exists to prove that path
 * works, rather than assuming it.
 */
export const forgetSchool = triggeredMutation({
  args: { school_id: v.id("schools") },
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.delete(args.school_id);
    return null;
  },
});
