# iRank Backlog

Tracks every item across Phase 1 and Phase 2. Specs live in `specs/`.

**Status vocabulary** — `Done` ≠ `Verified`. The contract closes only on `Verified`, which means demonstrated live against **real (not demo) data** to the League Coordinator.

| Status | Meaning |
|---|---|
| ⬜ Not Started | No code written |
| 🔵 In Progress | Being worked on |
| 🔴 Blocked | Waiting on a decision or another item |
| ✅ Done | Implemented and tested |
| ⭐ Verified | Demonstrated against real data |

---

## Decisions outstanding

Work is blocked on these. Listed first because they gate implementation.

| # | Question | Blocks | Status |
|---|---|---|---|
| D1 | Ranking weights and questions A–G | `ranking-model.md` | ✅ Signed off — 50/40/10 |
| D2 | Appeals process for rejected approval/verification | Phase 2 Steps 4, 9 | 🔴 Open |
| D3 | Do verification criteria differ per program? | Phase 2 Step 9 | 🔴 Open |
| D4 | Reporting template for confirmation email | Phase 2 Step 4 | 🔴 Open |
| D5 | Distribution of 50,000 vs 100,000 RWF | Phase 2 Step 6 | 🔴 Open |
| D6 | Volume limits — flag or enforce? | Phase 2 dashboard | 🔴 Open |
| D7 | SMTP sockets on Convex | Email transport | ✅ Confirmed working (gmail:587 STARTTLS) |
| D8 | Bye credit policy | Pairing, rankings | ✅ Win + same-stage average, at stage end |

---

## Phase 1

### 00 — Foundations · `specs/00-foundations.md`

| Item | Status |
|---|---|
| Vitest + convex-test setup (3 projects) | ✅ Done |
| React Testing Library setup | ✅ Done |
| `convex/test_helpers.ts` — signed-token session seeding | ✅ Done |
| `test` / `test:watch` / `test:coverage` / `typecheck` scripts | ✅ Done |
| CI workflow on PR (typecheck, test, build, audit) | ✅ Done |
| Audit gate fails on new critical/high advisories | ✅ Done |
| Migrate ESLint to flat config (v9 requirement) | ✅ Done |
| Commit lockfile | ✅ Done |
| `.env.example` | ✅ Done |
| Remove hardcoded Convex host | ✅ Done |
| Remove `ignoreDuringBuilds` | ✅ Done |
| `CLAUDE.md` | ✅ Done |
| **Fix React Compiler lint violations** | ✅ 122 → 7; the remainder are correct uses of effects (see below) |
| Playwright setup (E2E, 360px mobile) | ⬜ |
| Tournament fixtures (6–8 / 24–32 / 64+ teams) | ⬜ Blocked on `04-pairing` |
| Auth-coverage reflective test (all public functions) | ⬜ |

**Current tests: 758 passing across 36 files.**

**Lint debt.** `eslint-config-next` 16 enabled React Compiler rules that surfaced 122 pre-existing errors, previously hidden by `ignoreDuringBuilds: true`. Now **7**. The defects fixed along the way:

| Fixed | Why it mattered |
|---|---|
| `dynamic()` called inside 5 component bodies | Lazy component recreated every render, refetching its chunk |
| `Date.now()` in 4 analytics query args | New argument object per render resubscribed every Convex query continuously |
| Team dialog re-seeded from a live query | Unsaved edits wiped whenever the team record updated |
| Ballot re-seeded from a live query (×2) | A judge's entered marks wiped mid-edit |
| Ranking release settings re-seeded | Unsaved release toggles wiped |
| League edit dialog re-seeded | Unsaved league edits wiped |
| Judge panel re-seeded on debate update | Judges just picked were discarded |
| Flag dialog reset on ballot change | Selection wiped while the dialog was open |
| Speaking times overwritten on team-size change | Custom times silently reset to the format default |
| `InputDialog` defined inside render | Its `useState` was discarded — the field cleared as you typed |
| `SearchableSelect` defined inside render | Dropdown remounted each keystroke, losing focus |
| `ExportDialog` / skeletons defined inside render | Remounted every render |
| `Math.random()` DOM id in file upload | Hydration mismatch breaking the label/input binding |
| Sidebar skeleton width randomised | Server/client hydration mismatch |
| Audio chunk array held in state and mutated | State mutated in place; the value was never read |
| Waiver code expiry read at render | A code expiring while the dialog was open still showed active |
| Location cascade: 5 effects → memos | Options recomputed into state through six chained effects |
| Section state copied from the URL hash | Back/forward did not move between sections |
| `useIsMobile` / connectivity / auth session | Read via `useSyncExternalStore` instead of an effect + second render |

**The remaining 7** are cases where an effect is the correct tool and the rule cannot tell: three async loads (IndexedDB cache read, storage-image URL, paginated list accumulation), two session syncs in `use-auth.tsx` (server user → state, sign-out clearing), a saved-draft restore from `localStorage` in pairing, and one `handleRespondToInvitation` ordering warning in a 900-line component where reordering broke the file twice and was reverted. The 20 `exhaustive-deps` entries are warnings, not errors, and most name callback props that would loop if added.

### 01 — Security · `specs/01-security.md`

| Item | Status |
|---|---|
| **Close `"shared"` token bypass** (5 queries → internalQuery) | ✅ Done |
| Route shared reports through internal queries | ✅ Done |
| `exportAnalyticsData` uses internal queries | ✅ Done |
| **Auth on `updateRecording`** (+ audit log) | ✅ Done |
| ~~Fix `view_count` never incrementing~~ | ✅ Not a bug — already correct |
| Type `report_shares.report_id` | ⬜ Deferred (needs migration) |
| **Move Gemini server-side** (`convex/functions/ai.ts`) | ✅ Done |
| Migrate to `gemini-2.5-flash-lite` (2.0 was shut down 1 Jun 2026) | ✅ Done |
| Replace legacy `@google/generative-ai` with `@google/genai` | ✅ Done |
| **Rotate the exposed Gemini key** | ⬜ **Needs you — treat as compromised** |
| Set `GEMINI_API_KEY` in Convex env | ✅ Done |
| Audit all 28 files for missing auth | ⬜ |
| Cross-role access tests | ⬜ Blocked on `00-foundations` |
| **Upgrade `jspdf` 3.0.1 → 4.2.1 — cleared CRITICAL** | ✅ Done |
| **Upgrade `next` 15.4.8 → 16.3.0, React → 19.2.8** | ✅ Done |
| Replace abandoned `xlsx` with `write-excel-file` | ✅ Done |
| `postcss` / `sharp` — resolved by the Next upgrade | ✅ Done |
| **`npm audit`: 0 vulnerabilities** (was 1 critical + 4 high) | ✅ Done |
| Commit lockfile; un-ignore `.env.example` | ✅ Done |
| `.env.example` documenting the env contract | ✅ Done |
| Derive Convex image host from env | ✅ Done |
| CI fails on new critical/high advisories | ⬜ Blocked on `00-foundations` |
| Verify PDF + Excel export against real data | ⬜ **Needs manual check** |

### 00b — Convex components

| Item | Status |
|---|---|
| Action retrier for transactional email | ✅ Retained for invitations and magic links |
| **Workpool for bulk email** | ✅ `sendBulkEmail` was a serial loop in one action |
| **Workpool for push** | ✅ Replaces the hand-rolled `index * 100` stagger |
| **Workpool fan-out for ranking rebuild** | ✅ Per-tournament transactions, merged on completion |
| **Action cache for Gemini** | ✅ Keyed on content, not the session token (5 tests) |
| Workflow for the Phase 2 lifecycle | ⬜ Noted in `specs/07-phase2.md` §7.1 |
| Aggregate for analytics | ⬜ Deferred until after mobile and docs |
| Sharded counter | 🔴 Not needed — solves contention at thousands of concurrent writes |
| Batch worker | ✅ Already present as workpool's internal engine |

Two pools rather than one per message type, since each pool runs its own
coordinating functions. Notifications are capped at 6 in flight (the mail
provider's limit, not ours); ranking is capped at 2 because those jobs write to
shared rows and more would mostly produce write conflicts.

A real bug surfaced while wiring the fan-out: the merge was attached to the
*last enqueued* job, but jobs run concurrently so that is not the last to
*finish* — the merge ran on a partial set and dropped a tournament's points.
It now counts outstanding tallies in `ranking_runs` and merges at zero.

### 01b — Email · `specs/01b-email.md`

| Item | Status |
|---|---|
| SMTP spike on Convex Node runtime | ✅ Done — sockets work |
| Provider interface (`convex/lib/mailer.ts`) | ✅ Done |
| Migrate `email.ts` off Resend | ✅ Done |
| Retry via `@convex-dev/action-retrier` | ✅ Done |
| Branded template shell with logo | ✅ Done |
| Ranking release / payment / completion / motion / round emails | ✅ Built **and wired to their triggers** (11 tests) |
| Delivery verification to real inboxes | ⬜ **Needs manual check** |
| Push to judges on round completion and motion release | ✅ Alongside the emails (4 tests) |
| Bulk send at league scale | ⬜ |

### 02 — Ballot · `specs/02-ballot.md`

**Backend complete and tested. UI conversion is the remaining work.**

| Item | Status |
|---|---|
| `lib/scoring/wsdc.ts` — single source of truth (60 tests) | ✅ Done |
| Remove the 4 duplicated formulas | ✅ Done |
| Schema rewrite: Style/Content/Strategy, speech_type | ✅ Done |
| Required structured RFD (min 40 chars) | ✅ Done |
| `submission_state` (not_started/in_progress/submitted) | ✅ Done |
| Real `flagged` field; remove `[FLAG:]` strings | ✅ Done |
| `ballot_edits[]` audit with previous values | ✅ Done |
| Historical ballots — replaced outright (no prod data) | ✅ Done |
| Panel reconciliation — quorum, chair tiebreak, splits (10 tests) | ✅ Done |
| Low-point-win and draw blocking | ✅ Done |
| Half-mark validation | ✅ Done |
| POI ±2 modifier, clamped to band | ✅ Done |
| Reply speech halving (30–40) | ✅ Done |
| Format gating — mutation rejects non-WorldSchools | ✅ Done |
| Deduplicate `updateDebateResults` / round completion | ✅ Done |
| **Convert `tournament-ballot.tsx` to the new schema** | ✅ Done |
| RFD field in the UI | ✅ Done |
| Client-side submission guard mirroring server rules | ✅ Done |
| Half-mark score entry with per-criterion ranges | ✅ Done |
| Extract `components/tournaments/ballot/` (hook + 10 tests) | ✅ Done |
| Format "Coming soon" badges in the UI | ✅ Done |
| Exactly 3 speakers enforced for World Schools | ✅ Done |
| `team_size` + duplicate-position validation on ballots | ✅ Done |
| Typed component props (was `any` ×10) | ✅ Done |
| Auto-save on edit with animated indicator | ✅ Done |
| Timer wired to `speaking_times`, with warnings and chimes | ✅ Done |
| Flowing notes with continuous auto-save | ⬜ Argument-flow UX rebuild outstanding |
| Finish decomposing `tournament-ballot.tsx` | ⬜ Seam established; render sections not yet moved |

**Old schema is fully gone** — no `role_fulfillment`, `argumentation_clash`, `content_development`, `style_strategy_delivery`, `feedback_submitted`, or `attendanceBonus` anywhere in source.

Two bugs found during conversion, both fixed: `canEdit` used `!x === "submitted"` (negates before comparing, making every ballot permanently read-only), and round completion still filtered on the deleted `feedback_submitted` field, so no round would ever have completed.

### 03 — Offline · `specs/03-offline.md`

| Item | Status |
|---|---|
| Dexie local store + migrations | ✅ Done |
| **Durable outbox with idempotency** | ✅ Done |
| **Ballot drafts survive reload/crash** | ✅ Done |
| Real queue count (was hardcoded `0`) | ✅ Done |
| **Move `app/sw.js` → `public/sw.js`** | ✅ Done |
| Fix push icon paths | ✅ Done |
| Background sync wakes the page to drain | ✅ Done |
| **Push notifications wired end to end** | ✅ Done |
| Populate `sync_logs` | ✅ `convex/functions/sync.ts` |
| Workbox adoption | ⬜ |
| Remove stack-trace cache keys | ✅ Explicit keys only |
| Remove WebSocket monkey-patch | ✅ Convex `connectionState()` |
| Remove third-party connectivity pings | ✅ Detector rewritten |
| Bundle format (signed, versioned) | ✅ Checksum now covers payloads |
| QR export/import (chunked) | ✅ `lib/offline/transport.ts` |
| File export/import | ✅ `.irank.json`, integrity checked |
| **Per-item reconciliation review UI** | ✅ `components/offline/transfer-review.tsx` |
| Remove `@types/web-bluetooth` | ✅ Uninstalled |
| Airplane-mode E2E | ⬜ |

### 04 — Pairing · `specs/04-pairing.md`

| Item | Status |
|---|---|
| Extract `lib/pairing/` — pure, deterministic | ✅ |
| Seeded RNG; remove `Math.random()` | ✅ xorshift, seeded from the round |
| **Weighted cost model — no dropped teams** | ✅ Greedy pass + swap improvement |
| Server-side authority + sync verification | ✅ `generateRound` re-runs and compares |
| Cross-tournament history (`opponents_faced`) | ✅ Read as `prior_opponents`, decayed by age |
| Separate `is_bye` from `is_public_speaking` | ✅ `debates.is_bye` added |
| **Break calculation** | ✅ `lib/pairing/breaks.ts` |
| **Bracket generation, seeded** | ✅ 1v16 / 2v15, `advanceBracket` |
| Allow rematches in elims | ✅ Repeat penalty skipped when `stage === "elim"` |
| Write `eliminated_in_round` | ✅ `convex/lib/standings.ts` |
| Persist standings | ✅ Recomputed on each decided debate |
| Declared judge clashes + UI | ⬜ Engine honours `conflicts`; entry UI outstanding |
| Validate manual overrides | ✅ Same cost model, typed severity |
| Fix "Generate All Fold Rounds" history | ✅ Accumulates through the adapter |
| Make method selector functional | ⬜ |
| Implement `getPairingStats` | ✅ Real metrics, no more hardcoded zeros |
| Real room records | ⬜ |
| Remove dead in-bundle tests | ✅ `lib/pairing-algorithm.ts` deleted |
| **Property tests at 3 scales** | ✅ 183 tests, 2–400 teams, 5 prelims + elims |

### 05 — Rankings · `specs/05-rankings.md`

| Item | Status |
|---|---|
| **Shared `isTournamentCountable` predicate** | ✅ Done |
| **Gate global rankings on release** | ✅ Done |
| Filter to submitted ballots only | ✅ Done |
| Filter to completed tournaments | ✅ Done |
| **Delete `Math.random()` rank changes** | ✅ Done |
| Fix `tournamentsCount` | ✅ Done |
| Separate in-tournament vs league-wide layers | ✅ Done |
| Real rank deltas from snapshots | ⬜ Reports 0 until snapshots exist |
| **School tiers (Elite/Advanced/Developing/Beginner)** | ✅ Done |
| **League-wide weights 50/40/10** | ✅ Done |
| Percentile bands + Elite activity floor | ✅ Done |
| Tier damping (two consecutive evaluations) | ✅ Done |
| Local vs international speaker basis via `leagues.type` | ✅ Done |
| Stage-end bye credit (win + same-stage average) | ✅ Done |
| Team score double-count guard | ✅ Done |
| Nightly tier recalculation cron | ✅ Done |
| Eliminate full-table scans | ⬜ |
| Fix duplicated ranking computation | ⬜ |
| Ranking snapshots at release | ⬜ |
| Load test at round-end concurrency | ⬜ |

### 05b — Finance · `specs/05b-finance.md`

| Item | Status |
|---|---|
| Payment status tracking UI | ✅ `tournament-finance.tsx` |
| Student payment confirmation | ✅ School claim + admin review |
| Waiver codes under concurrency | ✅ Limit holds under 5-way race |
| Duplicate-submission protection | ✅ Same reference returns the first |
| School data isolation test | ✅ Cross-school read rejected |
| Offline payment recording | ⬜ |
| Index financial queries | ✅ `by_tournament_id_school_id`, `by_created_at` |

### 06 — Mobile · `specs/06-mobile.md`

| Item | Status |
|---|---|
| `ResponsiveTable` card-per-row pattern | ✅ `components/ui/responsive-table.tsx` (16 tests) |
| Full-screen mobile dialogs | ✅ `max-sm:` on `DialogContent`, survives call-site widths (9 tests) |
| Ballot / timer / flowing at 360px | ✅ Tabs 4→2 cols, scoring inputs full width, dialogs scroll |
| Pairings at 360px | ✅ Two `w-80` columns → `min-w`, judges/status drop, `60dvh` scroll region |
| Rankings at 360px | ✅ 9-column table → `ResponsiveTable`; tab lists 4→2 cols |
| Teams / users / students lists | ✅ Secondary columns drop below `sm`/`md`, header and cell together |
| Analytics dashboards | ✅ Stat grids 1-col below `sm`, page padding `p-3 sm:p-6` |
| Tournament creation form | ✅ Field grids 1-col below `sm` |
| Tournament overview at 360px | ✅ Was 0 `sm:`/`md:` in 1,779 lines; form grids now 1-col |
| Tap targets ≥44px on phones | ✅ Input, Button, Tabs, Checkbox primitives + auth links |
| Landscape orientation | ✅ Covered by the `mobile-landscape` Playwright project |
| Playwright 360px in CI | ✅ 3 projects (360px, landscape, desktop); runs on every push |
| Real low-end Android verification | ⬜ **Needs a physical device — cannot be automated** |

### 06b — Motion · `specs/06b-motion.md`

| Item | Status |
|---|---|
| `lib/motion/` shared vocabulary | ⬜ |
| Ballot submit feedback | ⬜ |
| Sync/outbox state feedback | ⬜ |
| Reconciliation accept/decline feedback | ⬜ |
| Rank change indicators (real deltas) | ⬜ |
| **Confetti on milestones** (new — does not exist) | ⬜ |
| `prefers-reduced-motion` | ⬜ |
| 60fps on low-end Android | ⬜ |

---

## Phase 2 · `specs/07-phase2.md`

| Item | Status |
|---|---|
| Activity schema + ten-stage state machine | ⬜ |
| Step 1 Draft (private) | ⬜ |
| Step 2 Submit | ⬜ |
| Step 3 Coordinator queues + risk level | ⬜ |
| Step 4 Decision + notification | 🔴 D2, D4 |
| Step 5 Internal assignment (separate screen) | ⬜ |
| Step 6 Grant release | 🔴 D5 |
| Step 7 Representative verification | ⬜ |
| Step 8 School report + 48h timer | ⬜ |
| Step 9 Verification | 🔴 D2, D3 |
| Step 10 Automatic league updates | ⬜ |
| League Manager Dashboard | ⬜ |
| Development-Pyramid progression | ⬜ |
| Volume guidance | 🔴 D6 |
| Student→judge feedback | ⬜ |
| Panelist→chair feedback | ⬜ |
| Chair→panelist feedback | ⬜ |
| Judge Feedback History | ⬜ |
| **Centralize authorization** (deferred from 01) | ⬜ |
| Full audit log | ⬜ |
| Backup + **tested restore** | ⬜ |
| Admin data-correction tool | ⬜ |
| Risk/eligibility flags | ⬜ |

---

## Phase 2/3 — Docs · `specs/08-docs.md`

| Item | Status |
|---|---|
| Nextra 2→4, Next 13→15 | ⬜ |
| Remove broken `_meta.json` entries | ⬜ |
| Write 13 missing pages | ⬜ |
| Volunteer section (0 pages today) | ⬜ |
| Ballot + WSDC scoring docs | ⬜ |
| Offline + peer sync docs | ⬜ |
| Coordinator workflow docs | ⬜ |
| Ranking model docs | ⬜ |
| Per-role manuals | ⬜ |
| Technical docs + restore procedure | ⬜ |
| Replace template README | ⬜ |
| **Independence test** | ⬜ |

---

## Deferred beyond Phase 3

| Item | Rationale |
|---|---|
| shadcn Radix → Base UI | Radix not deprecated; shadcn ships both. No forcing function. |
| Tailwind v3 → v4 | Bundled with the shadcn migration. |
| TanStack Start migration | App is already client-rendered; no payoff for the risk. |
| Convex frontend hosting | Vercel edge CDN + previews; no functional gain from moving. |
