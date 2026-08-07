import { TableAggregate } from "@convex-dev/aggregate";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { components } from "../_generated/api";
import { DataModel, Doc } from "../_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "../_generated/server";

/**
 * Counts by creation time, for the admin dashboard.
 *
 * The dashboard reports how many users, schools, tournaments and debates were
 * created in a window, and compares that with the previous window. It did this
 * by loading every row of each table and filtering in JavaScript, which is
 * fine at today's size and stops being fine as the league accumulates seasons.
 *
 * These give the same numbers in O(log n) rather than O(n).
 */
const byCreation = <T extends "users" | "schools" | "tournaments" | "debates">(
  component: any
) =>
  new TableAggregate<{ Key: number; DataModel: DataModel; TableName: T }>(component, {
    sortKey: (doc: Doc<T>) => doc.created_at,
  });

export const usersByCreation = byCreation<"users">(components.usersByCreation);
export const schoolsByCreation = byCreation<"schools">(components.schoolsByCreation);
export const tournamentsByCreation = byCreation<"tournaments">(
  components.tournamentsByCreation
);
export const debatesByCreation = byCreation<"debates">(components.debatesByCreation);

/**
 * Writes are hooked through triggers rather than by calling the aggregate at
 * each insert site.
 *
 * There are ten such sites across the four tables today, and any future one
 * that forgot the call would leave the count quietly wrong — the failure mode
 * being a dashboard that reads plausibly and is untrue. A trigger cannot be
 * forgotten.
 */
const triggers = new Triggers<DataModel>();

// The idempotent variant, because a row can exist before it has been counted:
// anything created before the backfill ran, or written directly in the Convex
// dashboard. The strict trigger throws on those rather than correcting itself,
// which would take down an ordinary edit.
triggers.register("users", usersByCreation.idempotentTrigger());
triggers.register("schools", schoolsByCreation.idempotentTrigger());
triggers.register("tournaments", tournamentsByCreation.idempotentTrigger());
triggers.register("debates", debatesByCreation.idempotentTrigger());

/**
 * Use these in place of the generated `mutation` and `internalMutation` for any
 * function that writes to a counted table.
 */
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB)
);
