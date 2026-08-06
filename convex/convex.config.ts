import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config.js";
import actionCache from "@convex-dev/action-cache/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();

app.use(actionRetrier);
app.use(actionCache);

// Counts over a date range for the admin dashboard, which previously loaded
// every row of each table and filtered in JavaScript. One aggregate per table
// rather than one shared, so a busy table cannot slow another's reads.
app.use(aggregate, { name: "usersByCreation" });
app.use(aggregate, { name: "schoolsByCreation" });
app.use(aggregate, { name: "tournamentsByCreation" });
app.use(aggregate, { name: "debatesByCreation" });

// Outbound notifications. One pool rather than one per message type: each pool
// runs its own coordinating functions, so more pools cost more.
app.use(workpool, { name: "notificationPool" });

// Ranking work is heavy and must never delay a notification, so it is queued
// separately and kept narrow.
app.use(workpool, { name: "rankingPool" });

export default app;
