import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "cleanup expired auth data",
  { minuteUTC: 0 },
  internal.functions.auth.cleanupExpired,
);

crons.interval(
  "cleanup expired notifications",
  { hours: 6 },
  internal.functions.notifications.cleanupExpiredNotifications,
);

// Fans out over tournaments through the ranking pool rather than walking them
// all in one transaction.
crons.daily(
  "rebuild ranking snapshots",
  { hourUTC: 3, minuteUTC: 0 },
  internal.functions.ranking_rebuild.startRebuild,
);

crons.daily(
  "clear abandoned ranking tallies",
  { hourUTC: 4, minuteUTC: 30 },
  internal.functions.ranking_rebuild.cleanupStaleTallies,
);

// Tiers are relative, so one school's result can move another's band. They are
// recomputed for the whole league rather than per school.
crons.daily(
  "recalculate school tiers",
  { hourUTC: 3, minuteUTC: 30 },
  internal.functions.school_tiers.recalculateTiers,
);

crons.daily(
  "cleanup inactive subscriptions",
  { hourUTC: 2, minuteUTC: 0 },
  internal.functions.notifications.cleanupInactiveSubscriptions,
  { days: 30 },
);


crons.cron(
  "monthly audit logs cleanup",
  "0 1 28-31 * *",
  internal.functions.audit.monthlyAuditCleanup,
);

crons.daily(
  "daily cleanup check",
  { hourUTC: 1, minuteUTC: 0 },
  internal.functions.audit.conditionalMonthlyCleanup,
);

export default crons;