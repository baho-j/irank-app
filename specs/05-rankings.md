# 05 — Rankings, Release Gate, and Query Performance

**Phase:** 1 · **Blocked on:** `ranking-model.md` weights sign-off (league-wide layer only)

## Deliverable

> **School Ranking tiers (Elite / Advanced / Developing / Beginner School) recalculate automatically** from live participation and performance data — not from a manually maintained table.

> **Team Rankings correctly combine participation points (inherited from the school) with round-by-round performance.** Confirm the two figures are actually added together — not double-counted, and not missing one.

> Digital Rankings Platform ... is live and **matches the admin-side data exactly — no drift** between what schools see and what Coordinators see.

---

## Issue 1 — The release gate is bypassed by every global ranking

### Current state

`tournaments.ranking_released` (`schema.ts:245-259`) is a well-designed gate: `prelims` and `full_tournament` scopes × `teams`/`schools`/`students`/`volunteers`, plus `visible_to_roles`.

It is **correctly enforced** in the four per-tournament queries in `convex/functions/rankings.ts` (lines 1106, 1189, 1272, 1354).

A repo-wide grep for `ranking_released` returns hits in exactly three files: `schema.ts`, `rankings.ts`, `tournament-ranking.tsx`. **No global or leaderboard query references it at all.**

The global rankings live elsewhere — in the dashboard files:

| Query | File | Gating |
|---|---|---|
| `getStudentRankAndPosition` | `student/dashboard.ts:104` | `status === "completed"` only |
| `getStudentLeaderboard` | `student/dashboard.ts:384` | **none** |
| `getSchoolRankAndPosition` | `school/dashboard.ts:109` | `status === "completed"` only |
| `getSchoolLeaderboard` | `school/dashboard.ts:444` | **none** |
| `getVolunteerRankAndPosition` / `Leaderboard` | `volunteers/dashboard.ts:99` / `344` | as above |

`getStudentLeaderboard` (`student/dashboard.ts:411-431`) is the worst case:

```ts
const allJudgingScores = await ctx.db.query("judging_scores").collect();
const allTeams = await ctx.db.query("teams").collect();
for (const student of allStudents) {
  ...
  for (const score of allJudgingScores) {          // every ballot, every tournament
    const studentSpeakerScores = score.speaker_scores.filter(ss => ss.speaker_id === student._id);
    for (const speakerScore of studentSpeakerScores) { totalPoints += speakerScore.score; scoresCount++; }
  }
}
```

It sums **every ballot in the database** into a public top-3 leaderboard — including `draft`, `inProgress`, and `cancelled` tournaments, and including **unsubmitted draft ballots** (none of the global queries filter `feedback_submitted`, unlike `updateDebateResults`).

This is exactly the behaviour you described: unreleased tournament results reaching general student and school rankings.

### Two further defects in the same code

**Fabricated trend data shown to users** — `student/dashboard.ts:443` and `school/dashboard.ts:524`:

```ts
rankChange: Math.random() > 0.6 ? 1 : Math.random() > 0.3 ? -1 : 0,
```

The up/down arrow on the leaderboard is random noise, re-rolled on every render.

**Wrong tournament count** — `tournamentsCount: studentTeams.length` (line 442) counts *teams*, not distinct tournaments.

### Target state

A tournament's results reach a global ranking only when **all** hold:
1. `ranking_released` is set for the relevant scope, entity type, and the viewer's role
2. The tournament is `completed`
3. The ballot is `submitted`, not draft

Admins may bypass, consistent with per-tournament behaviour.

### Design

A single shared predicate — `isTournamentCountable(tournament, scope, entity, role)` — used by every global and per-tournament query, so the rule exists in one place. Global queries filter tournaments through it before aggregating.

Delete the `Math.random()` rank changes; compute real deltas by comparing against the prior ranking snapshot. Fix `tournamentsCount` to count distinct tournaments.

### Acceptance criteria

- [ ] A completed-but-unreleased tournament contributes **nothing** to any global student, school, or volunteer ranking or leaderboard
- [ ] Releasing it makes its results appear
- [ ] Releasing for one role does not expose it to another
- [ ] `draft` / `inProgress` / `cancelled` tournaments never contribute
- [ ] Unsubmitted draft ballots never contribute
- [ ] Admin-side and school-side figures match exactly — no drift
- [ ] No `Math.random()` anywhere in ranking output
- [ ] `tournamentsCount` counts distinct tournaments

---

## Issue 2 — Two ranking layers must not be conflated

Per user correction, these are distinct and must stay distinct:

**In-tournament standings** — WSDC speaker points and wins **only**. No attendance, no school criteria, no participation points. This is what decides who wins and who breaks.

**League-wide rankings** — performance **plus** attendance, participation points inherited from the school, and school tier.

The deliverable's warning applies to the second: participation and performance must be **added**, not double-counted and not silently dropped. Weights are specified in `ranking-model.md` and require sign-off before implementation.

### School tiers

**Elite / Advanced / Developing / Beginner do not exist in the codebase.** No such enum in schema or backend. The only near-matches are two hardcoded UI labels in `student/analytics/page.tsx:1059,1093` (a static skill legend, unrelated) and the gamified `school_level` / badges in `school/analytics.ts:1255`.

Tiers must be **derived automatically** from live participation and performance — never a maintained table. Thresholds go in `ranking-model.md`.

### Acceptance criteria

- [ ] In-tournament standings contain no attendance or school-derived component
- [ ] League-wide rankings add participation and performance exactly once each
- [ ] Tiers recalculate automatically; no manual table
- [ ] Tier boundaries are configurable and documented
- [ ] A school crossing a threshold changes tier without manual intervention

---

## Issue 3 — Ranking queries do not scale

### Current state

Everything is computed on read with **nothing cached**, over unindexed full-table scans.

`ctx.db.query("judging_scores").collect()` appears in `pairings.ts:110`, `rankings.ts` (×5: 118, 211, 631, 682), `student/dashboard.ts` (×3: 128, 318, 411). `ctx.db.query("debates").collect()` in `school/dashboard.ts:136,473` and elsewhere.

`computeSchoolRankings` calls `computeTeamRankings` **and** `computeStudentRankings`, which itself calls `computeTeamRankings` again — so one school-ranking read recomputes team rankings twice, then runs `computeStudentCrossTournamentPerformance` per speaker, each doing a full `judging_scores` scan per tournament in the league. That is O(speakers × tournaments) full scans in a single query.

These scale with the whole league, not the tournament, and will hit Convex read limits.

Also: `getFinancialAnalytics` scans all `payments` and filters in JS (`admin/analytics.ts:464-468`) instead of using the `by_created_at` index.

### Target state

Rankings load in a few seconds under tournament-day load, per the non-functional requirements.

### Design

- Index every hot path; eliminate `.collect()` full scans.
- Compute team rankings once per request and pass down, rather than recomputing.
- Persist derived standings (`prelim_wins`, `prelim_points`, etc. — currently declared but never written), invalidated on ballot submission.
- Snapshot rankings at release so historical positions are stable and rank deltas are real.

### Acceptance criteria

- [ ] No unindexed full-table scan on any ranking path
- [ ] Team rankings computed at most once per request
- [ ] Rankings load within a few seconds at realistic league size — measured, not assumed
- [ ] Load test at round-end concurrency passes
- [ ] Persisted standings always agree with recomputation from ballots

---

## Out of scope

- Weights and tier thresholds → `ranking-model.md`
- Break calculation → `04-pairing.md`
- Ballot scoring → `02-ballot.md`
- Payment tracking → `05b-finance.md`
