# 07 — Phase 2: Pre-Tournament Workflow, Dashboard, Feedback

**Phase:** 2 · **Depends on:** all Phase 1 specs

> **Important distinction:** the Pre-Tournament Registration & Approval workflow does not exist in the system in any form yet. It is **not an existing feature to be fixed — it is entirely new work.**

Confirmed: no tables, functions, or routes for any of this exist.

---

## 7.1 Ten-stage activity lifecycle

`Draft → Pending Approval → Approved/Rejected → Grant Released → Conducted → Report Submitted → Verified/Rejected/Needs Clarification → League Data Updated`

Covers **Club Competitions** (internal) and **SLDs** (inter-school, hosted).

### Implementation note — use the Workflow component

Build this on [`@convex-dev/workflow`](https://www.convex.dev/components/workflow),
not on hand-rolled status fields and scheduled functions.

The lifecycle is long-running (a school may sit in Draft for weeks), multi-step
with real dependencies between steps, and has to survive restarts. It also needs
reactive status so a coordinator can watch where a submission has reached, and
the 48-hour report timer in Step 8 is a durable delay rather than a cron sweep.

Doing it by hand means a status column plus a scatter of `runAfter` calls, which
is how a workflow silently ends up in an impossible state — a grant released
against a submission that was later rejected, or a report timer still ticking on
a cancelled activity. The component journals each step, so a half-finished
lifecycle resumes rather than being reconstructed by guesswork.

This is **not** needed for anything in Phase 1: nothing in the tournament flow
runs long enough to justify the durable journal. Workpool is the right tool
there, and is already in use for notifications and ranking rebuilds.

### Step 1 — Draft
Debate Patron enters type, date/time, venue, program(s) (Debate / Public Speaking / Money Makeover), expected students and teams, and for SLDs expected participating schools.

**Drafts are fully private** — freely editable and deletable by the school, with **zero visibility** to any iDebate queue, dashboard, or reviewer. This is a hard access-control requirement, tested explicitly.

### Step 2 — Submit
Cannot leave Draft without: grant request (50,000 RWF Club / 100,000 RWF SLD, Yes/No), representative request (Yes/No + purpose, judge count, motions needed), expected attendance, and an uploaded schedule. Status → Pending Approval, appearing in the Coordinator queue.

### Step 3 — Coordinator queues
**Purpose-built queues** — Pending Club Competitions, Pending SLDs, Pending Coach Requests, Pending Reports — *not one generic tournament list*.

Each item shows, **without an extra click**: school name & province, proposed date, representative requested, grant requested, on-time report history, current point total, prior competitions run, coach-assignment status, and a **calculated risk level**.

Actions: Approve / Reject / Request Changes.

### Step 4 — Decision and notification
Automatic, immediate notification per outcome. Approved includes Competition ID, reporting deadline, representative status, and grant confirmation with reporting requirements.

**Open question 3 (from your PDF comments): the reporting template should be attached to the confirmation email.** Needs the template.

### Step 5 — Internal assignment
iDebate-only screen, invisible to schools: assign Representative, Judge, Coach; approve grant amount, motions, certificates, media.

**Explicitly a separate screen from Step 3** — the workflow doc calls this out, because staffing often happens days after approval.

### Step 6 — Grant release
Finance queue of approved activities awaiting grants (school, fixed amount, reference, status). `Release Grant` records Payment Date and Reference Number → Grant Released.

Released **before** the activity — the grant enables execution rather than reimbursing it.

**Open question 4: distribution of 50,000 vs 100,000.** Needs clarification.

### Step 7 — Activity day
Representative marks Competition Started / Finished, then a verification form: did it happen, attendance observed, quality, challenges, recommendation, approve for funding (Yes/No/Needs Review).

**Skip behaviour**: no representative assigned → this step must not block; evidence burden shifts to the school's report.

The representative's funding answer is a **recommendation, not a decision**.

### Step 8 — School report
Within **48 hours**: attendance, photos, results, winning teams, **itemized financial accountability**, narrative. Overdue flags on both dashboards; a released grant becomes an outstanding accountability item if missed.

### Step 9 — Verification
One consolidated screen: representative report (if any), school report, evidence, and financial accountability together — **nothing requiring a switch to another screen**.

Outcomes: Verified (awards points, updates record) / Rejected (no points, flags released grant for review) / Needs Clarification (returns a specific question, re-enters this step).

**Open question 1: no appeals process exists** for a rejected approval (Step 4) or rejected verification (Step 9). Needs at least a one-line policy.

**Open question 2: multi-program activities** — if judging standards differ across Debate / Public Speaking / Money Makeover, Step 9's checklist must branch.

### Step 10 — Automatic league data updates
On Verified, with **zero manual re-entry**: club competition/SLD totals, Participation Points, counts run/hosted/participated, Money Given, Grant History, Activity History, School Timeline entry.

Feeds `05-rankings.md` and `ranking-model.md` participation.

---

## 7.2 League Manager Dashboard

Five standing questions answered **live, not from cached numbers**:

1. Pipeline — Club Competitions Planned/Approved/Completed; Reports Pending/Rejected
2. SLD program — Planned/Completed/Pending Approval
3. Who needs something — schools requesting Grants, Representatives, Coaches
4. Where the money is — Grants Approved, Grants Released, Outstanding Payments
5. Growth — Schools Active vs Inactive, avg competitions/SLDs per school, Schools Eligible vs Not Yet Eligible for Regionals

**Development-Pyramid progression** — no level may be skipped; a school cannot register for or be credited with an SLD, Regional Monthly Circuit, or Regional Qualifier without qualifying at the level below.

**Volume guidance** — flag or enforce ≤2 ranked Club Competitions per month and ≤3 SLDs per month per host school. *Decision needed: flag or enforce?*

---

## 7.3 Feedback system

Three flows, each tied to a specific round and room so feedback is never confused across debates:

- **Student → judge**: rating + optional comments. **Coordinator-only — never visible to the judge, other students, or schools.** Hard access-control requirement.
- **Panelist → chair**
- **Chair → panelist**

Plus a **Judge Feedback History** view for Coordinators only, supporting selection and promotion.

**Feedback must never block or delay ballot submission** — a separate step afterwards.

All entries timestamped and attributable in the audit log.

Note: `judge_feedback` and `judge_results.feedback_scores[]` already exist for team→judge feedback and can be extended rather than replaced.

---

## 7.4 Cross-cutting Phase 2 items

- **Centralize authorization** — the refactor deferred from `01-security.md`. Replace 62 copy-pasted role comparisons across 28 files with shared helpers.
- **Full audit log** across every approval, rejection, grant release, ballot edit, feedback entry, and verification decision.
- **Automated backups with a tested restore** — *confirmed by actually restoring*, not by configuration.
- **Load testing** for round-end concurrency.
- **Duplicate-submission protection** on all forms.
- **Admin data-correction tool** with mandatory reason and audit trail, so Coordinators are not dependent on the developer to fix data.
- **Risk/eligibility flag** on school profiles when a grant is flagged at verification.

---

## Acceptance criteria

- [ ] All ten stages implemented with correct transitions and no skipping
- [ ] Drafts invisible to iDebate — asserted by test
- [ ] Queues are purpose-built and show every listed field without a click
- [ ] Risk level calculated, not manual
- [ ] Step 5 is genuinely a separate screen from Step 3
- [ ] Grant release records payment date and reference; happens pre-activity
- [ ] 48-hour timer flags overdue on both dashboards
- [ ] Step 7 skips cleanly with no representative
- [ ] Verification screen consolidates all evidence in one view
- [ ] Verified fires all Step 10 updates automatically, exactly once
- [ ] Dashboard answers all five questions from live data
- [ ] Progression rules prevent level-skipping
- [ ] Student→judge feedback invisible to judges — asserted by test
- [ ] Feedback never blocks ballot submission
- [ ] Backup restore demonstrated
- [ ] Open questions 1–4 answered and implemented

## Blocked on decisions

| # | Question |
|---|---|
| 1 | Appeals process for rejected approval/verification |
| 2 | Do verification criteria differ per program? |
| 3 | Reporting template for the confirmation email |
| 4 | Distribution of 50,000 vs 100,000 |
| 5 | Volume limits: flag or enforce? |
