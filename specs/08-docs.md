# 08 — Documentation Site

**Phase:** 2/3 · **Repo:** `D:\idebate\irankhub-docs` · **Depends on:** feature specs stabilizing

## Deliverable

> A written admin/user guide for each role, and technical/API documentation for anything iDebate Rwanda staff or a future developer would need to maintain the system.

> A complete, plain-language manual covering every role in the system (School, Coordinator, Regional Coordinator, Finance, Representative, Judge) — **written for the people who will actually use it, not just technical staff.**

This is load-bearing for handover: the contract closes only when iDebate can run iRank with no developer on staff, proven by an independence test.

---

## Current state

A **13-month-untouched scaffold**. Git history is two commits, both dated 2025-07-01: `initial commit` and `Initial commit from Create Next App`.

**Stack:** Nextra 2 (`pages/` router) on **Next 13.5.6**, React 18 — two majors behind the app's own Next 15.4.8.

**Content — 8 MDX pages, ~1,300 lines:**

```
index.mdx                              Welcome
getting-started/overview.mdx
getting-started/accessing-irankhub.mdx
getting-started/choosing-user-type.mdx
schools/school-registration.mdx
schools/school-sign-in.mdx
students/registration.mdx
students/sign-in.mdx
volunteers/_meta.json                  ← sidebar only, ZERO pages
```

### The sidebar advertises far more than exists

Root `_meta.json` declares six sections; **`pages/admins/` and `pages/features/` do not exist at all.**

Missing but declared:

| Section | Missing pages |
|---|---|
| `volunteers/` | Judge Registration, Judge Sign In, Judging Interface, Scoring System, Feedback Guidelines — **all 5** |
| `students/` | dashboard, joining-tournaments, viewing-schedule, performance-tracking — **all 4** |
| `schools/` | managing-students, team-management, tournament-participation — **all 3** |
| `getting-started/` | mobile-app ("Mobile App & PWA") |

**Roughly 13 of 21 declared pages do not exist**, so the sidebar renders broken entries.

### What is documented vs what matters

Everything written covers signup and sign-in. **Nothing covers the tournament workflow** — pairings, ballots, rankings, finance — which is the bulk of the app and the entire subject of the manuals the contract requires.

`README.md` is still the unmodified Nextra template, including "*this project is not production ready, API might change without notice*".

Meanwhile `site-header.tsx` links every logged-in user to `https://docs.irankhub.debaterwanda.org` via the help icon — so users are being sent to a broken, half-empty site today.

---

## Target state

Complete, current, plain-language documentation for every role, plus the technical documentation a future maintainer needs.

## Design

### Stack

Upgrade Nextra 2 → 4 and Next 13 → 15, aligning with the app. Nextra 4 uses App Router, so this is a migration rather than a version bump — worth doing once here rather than inheriting a two-major gap at handover.

### Structure

Reorganize around **what a person is trying to do**, not around the app's navigation:

```
getting-started/     accounts, roles, mobile/PWA install
schools/             registration, students, teams, tournaments, payments, activities (Phase 2)
students/            joining, schedule, performance
volunteers/          judge registration, the ballot, WSDC scoring, flowing, feedback
coordinators/        tournaments, pairings, ballot oversight, rankings & release, verification
finance/             payments, waivers, grants (Phase 2)
representatives/     activity-day verification (Phase 2)
operations/          offline use, peer sync, troubleshooting
technical/           architecture, env vars, deploy, backup & restore
```

Delete `_meta.json` entries with no page. A sidebar must never advertise a page that does not exist.

### Content priorities

1. **The judge's ballot** — WSDC scoring, flowing, offline behaviour. The highest-stakes, most-used screen.
2. **Offline operation and peer sync** — genuinely novel, and unusable without explanation.
3. **Coordinator tournament flow** — pairings, overrides, ranking release.
4. **Ranking model** — how points, participation, and tiers are computed. Schools will contest rankings; the rules must be public and match `ranking-model.md` exactly.
5. **Role manuals** for the Phase 3 handover.
6. **Technical docs** — architecture, env contract, deploy, backup/restore.

### Accuracy

Documentation is written **after** each feature stabilizes and reviewed against the implementation, not against the plan. Screenshots come from the built app. Where a doc states a rule (score ranges, tier thresholds), it cites the spec so the two cannot drift silently.

## Acceptance criteria

- [ ] No `_meta.json` entry lacks a page; no broken sidebar links
- [ ] Every role has a complete guide: School, Coordinator, Regional Coordinator, Finance, Representative, Judge, Student
- [ ] Tournament workflow fully documented — pairings, ballots, rankings, finance
- [ ] WSDC scoring documented and matching `02-ballot.md` exactly
- [ ] Ranking model documented and matching `ranking-model.md` exactly
- [ ] Offline and peer sync documented for non-technical users
- [ ] Technical docs cover architecture, env vars, deploy, and **a backup/restore procedure that has been executed, not just described**
- [ ] Written in plain language — reviewed by someone non-technical
- [ ] Nextra 4 / Next 15, building clean
- [ ] README replaced
- [ ] **Independence test passes**: the iDebate team completes approvals, grant release, ballot entry, and verification using only the documentation

## Out of scope

- In-app help — this spec covers the standalone site
