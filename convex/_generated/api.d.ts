/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as functions_admin_analytics from "../functions/admin/analytics.js";
import type * as functions_admin_ballots from "../functions/admin/ballots.js";
import type * as functions_admin_dashboard from "../functions/admin/dashboard.js";
import type * as functions_admin_invitations from "../functions/admin/invitations.js";
import type * as functions_admin_leagues from "../functions/admin/leagues.js";
import type * as functions_admin_superadmin from "../functions/admin/superadmin.js";
import type * as functions_admin_teams from "../functions/admin/teams.js";
import type * as functions_admin_tournaments from "../functions/admin/tournaments.js";
import type * as functions_admin_users from "../functions/admin/users.js";
import type * as functions_aggregate_backfill from "../functions/aggregate_backfill.js";
import type * as functions_ai from "../functions/ai.js";
import type * as functions_alerts from "../functions/alerts.js";
import type * as functions_analytics from "../functions/analytics.js";
import type * as functions_audit from "../functions/audit.js";
import type * as functions_auth from "../functions/auth.js";
import type * as functions_ballots from "../functions/ballots.js";
import type * as functions_email from "../functions/email.js";
import type * as functions_finance from "../functions/finance.js";
import type * as functions_invitations from "../functions/invitations.js";
import type * as functions_leagues from "../functions/leagues.js";
import type * as functions_notification_emails from "../functions/notification_emails.js";
import type * as functions_notification_queue from "../functions/notification_queue.js";
import type * as functions_notification_recipients from "../functions/notification_recipients.js";
import type * as functions_notifications from "../functions/notifications.js";
import type * as functions_pairing_engine from "../functions/pairing_engine.js";
import type * as functions_pairings from "../functions/pairings.js";
import type * as functions_ranking_rebuild from "../functions/ranking_rebuild.js";
import type * as functions_ranking_snapshots from "../functions/ranking_snapshots.js";
import type * as functions_rankings from "../functions/rankings.js";
import type * as functions_school_analytics from "../functions/school/analytics.js";
import type * as functions_school_dashboard from "../functions/school/dashboard.js";
import type * as functions_school_students from "../functions/school/students.js";
import type * as functions_school_tiers from "../functions/school_tiers.js";
import type * as functions_schools from "../functions/schools.js";
import type * as functions_student_analytics from "../functions/student/analytics.js";
import type * as functions_student_dashboard from "../functions/student/dashboard.js";
import type * as functions_student_teams from "../functions/student/teams.js";
import type * as functions_sync from "../functions/sync.js";
import type * as functions_team_lineups from "../functions/team_lineups.js";
import type * as functions_teams from "../functions/teams.js";
import type * as functions_tournaments from "../functions/tournaments.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_volunteers_analytics from "../functions/volunteers/analytics.js";
import type * as functions_volunteers_ballots from "../functions/volunteers/ballots.js";
import type * as functions_volunteers_dashboard from "../functions/volunteers/dashboard.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_ballot_results from "../lib/ballot_results.js";
import type * as lib_ballot_validation from "../lib/ballot_validation.js";
import type * as lib_email_layout from "../lib/email_layout.js";
import type * as lib_mailer from "../lib/mailer.js";
import type * as lib_motion_release from "../lib/motion_release.js";
import type * as lib_pairing_inputs from "../lib/pairing_inputs.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_pools from "../lib/pools.js";
import type * as lib_push_service from "../lib/push_service.js";
import type * as lib_ranking_release from "../lib/ranking_release.js";
import type * as lib_retrier from "../lib/retrier.js";
import type * as lib_standings from "../lib/standings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  files: typeof files;
  "functions/admin/analytics": typeof functions_admin_analytics;
  "functions/admin/ballots": typeof functions_admin_ballots;
  "functions/admin/dashboard": typeof functions_admin_dashboard;
  "functions/admin/invitations": typeof functions_admin_invitations;
  "functions/admin/leagues": typeof functions_admin_leagues;
  "functions/admin/superadmin": typeof functions_admin_superadmin;
  "functions/admin/teams": typeof functions_admin_teams;
  "functions/admin/tournaments": typeof functions_admin_tournaments;
  "functions/admin/users": typeof functions_admin_users;
  "functions/aggregate_backfill": typeof functions_aggregate_backfill;
  "functions/ai": typeof functions_ai;
  "functions/alerts": typeof functions_alerts;
  "functions/analytics": typeof functions_analytics;
  "functions/audit": typeof functions_audit;
  "functions/auth": typeof functions_auth;
  "functions/ballots": typeof functions_ballots;
  "functions/email": typeof functions_email;
  "functions/finance": typeof functions_finance;
  "functions/invitations": typeof functions_invitations;
  "functions/leagues": typeof functions_leagues;
  "functions/notification_emails": typeof functions_notification_emails;
  "functions/notification_queue": typeof functions_notification_queue;
  "functions/notification_recipients": typeof functions_notification_recipients;
  "functions/notifications": typeof functions_notifications;
  "functions/pairing_engine": typeof functions_pairing_engine;
  "functions/pairings": typeof functions_pairings;
  "functions/ranking_rebuild": typeof functions_ranking_rebuild;
  "functions/ranking_snapshots": typeof functions_ranking_snapshots;
  "functions/rankings": typeof functions_rankings;
  "functions/school/analytics": typeof functions_school_analytics;
  "functions/school/dashboard": typeof functions_school_dashboard;
  "functions/school/students": typeof functions_school_students;
  "functions/school_tiers": typeof functions_school_tiers;
  "functions/schools": typeof functions_schools;
  "functions/student/analytics": typeof functions_student_analytics;
  "functions/student/dashboard": typeof functions_student_dashboard;
  "functions/student/teams": typeof functions_student_teams;
  "functions/sync": typeof functions_sync;
  "functions/team_lineups": typeof functions_team_lineups;
  "functions/teams": typeof functions_teams;
  "functions/tournaments": typeof functions_tournaments;
  "functions/users": typeof functions_users;
  "functions/volunteers/analytics": typeof functions_volunteers_analytics;
  "functions/volunteers/ballots": typeof functions_volunteers_ballots;
  "functions/volunteers/dashboard": typeof functions_volunteers_dashboard;
  "lib/aggregates": typeof lib_aggregates;
  "lib/ballot_results": typeof lib_ballot_results;
  "lib/ballot_validation": typeof lib_ballot_validation;
  "lib/email_layout": typeof lib_email_layout;
  "lib/mailer": typeof lib_mailer;
  "lib/motion_release": typeof lib_motion_release;
  "lib/pairing_inputs": typeof lib_pairing_inputs;
  "lib/password": typeof lib_password;
  "lib/pools": typeof lib_pools;
  "lib/push_service": typeof lib_push_service;
  "lib/ranking_release": typeof lib_ranking_release;
  "lib/retrier": typeof lib_retrier;
  "lib/standings": typeof lib_standings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  usersByCreation: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"usersByCreation">;
  schoolsByCreation: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"schoolsByCreation">;
  tournamentsByCreation: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"tournamentsByCreation">;
  debatesByCreation: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"debatesByCreation">;
  notificationPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"notificationPool">;
  rankingPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"rankingPool">;
};
