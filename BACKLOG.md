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
| D1 | Ranking weights (proposed 50/35/15) and questions A–G | `ranking-model.md`, league-wide rankings | 🔴 Awaiting sign-off |
| D2 | Appeals process for rejected approval/verification | Phase 2 Steps 4, 9 | 🔴 Open |
| D3 | Do verification criteria differ per program? | Phase 2 Step 9 | 🔴 Open |
| D4 | Reporting template for confirmation email | Phase 2 Step 4 | 🔴 Open |
| D5 | Distribution of 50,000 vs 100,000 RWF | Phase 2 Step 6 | 🔴 Open |
| D6 | Volume limits — flag or enforce? | Phase 2 dashboard | 🔴 Open |
| D7 | SMTP sockets on Convex — spike result | Email transport choice | 🔴 Pending spike |
| D8 | Bye credit policy (proposed: win + average points) | Pairing, rankings | 🔴 Open |

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
| **Fix 121 React Compiler lint violations** | ⬜ See below |
| Playwright setup (E2E, 360px mobile) | ⬜ |
| Tournament fixtures (6–8 / 24–32 / 64+ teams) | ⬜ Blocked on `04-pairing` |
| Auth-coverage reflective test (all public functions) | ⬜ |

**Current tests: 48 passing** — analytics authorization (36), `updateRecording` authorization (5), Excel export adapter (7).

**Lint debt.** `eslint-config-next` 16 enabled React Compiler rules that flag 121 pre-existing errors, previously hidden by `ignoreDuringBuilds: true`:

| Rule | Errors | Why it matters |
|---|---|---|
| `react-hooks/set-state-in-effect` | 54 | Cascading re-renders — directly relevant to the app-speed goal |
| `react-hooks/static-components` | 30 | Components redefined each render, losing state |
| `react-hooks/purity` | 29 | Impure render, e.g. the `Math.random()` in rankings |
| `react-hooks/refs`, `preserve-manual-memoization`, `immutability` | 8 | |

Lint runs in CI with `continue-on-error` so violations stay visible without blocking. Many sit in `hooks/use-offline.tsx`, which `03-offline.md` replaces outright — fix that first, then re-count.

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
| Set `GEMINI_API_KEY` in Convex env | ⬜ **Needs you** |
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

### 01b — Email · `specs/01b-email.md`

| Item | Status |
|---|---|
| SMTP spike on Convex Node runtime | 🔴 D7 |
| Provider interface | ⬜ |
| Migrate `email.ts` off Resend | 🔴 D7 |
| Delivery verification to real inboxes | ⬜ |
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
| **Convert `tournament-ballot.tsx` to the new schema** | 🔵 **In progress — see below** |
| Format "Coming soon" badges in the UI | ⬜ |
| Flowing notes with continuous auto-save | ⬜ Blocked on `03-offline` |
| Timer wired to `speaking_times`, persisted | ⬜ |
| Decompose `tournament-ballot.tsx` (3,964 lines) | ⬜ |

**UI conversion state.** `SCORING_CATEGORIES` is updated to Style/Content/Strategy, but the component still reads and writes the old fields in ~30 places (`feedback_submitted`, the four old category keys, `is_final_submission`). One typecheck error is currently outstanding: `updateBallot` now requires a `reason`.

The component is typed with `any` throughout, so the compiler catches almost none of this — the conversion has to be done by reading the file, not by chasing type errors. That is the same reason it needs decomposing, so both should happen in one pass.

### 03 — Offline · `specs/03-offline.md`

| Item | Status |
|---|---|
| Dexie local store + migrations | ⬜ |
| **Durable outbox with idempotency** | ⬜ |
| Populate `sync_logs` | ⬜ |
| **Move `app/sw.js` → `public/sw.js`** | ⬜ |
| Workbox adoption | ⬜ |
| Fix push icon paths | ⬜ |
| Remove stack-trace cache keys | ⬜ |
| Remove WebSocket monkey-patch | ⬜ |
| Remove third-party connectivity pings | ⬜ |
| Bundle format (signed, versioned) | ⬜ |
| QR export/import (chunked) | ⬜ |
| File export/import | ⬜ |
| **Per-item reconciliation review UI** | ⬜ |
| Remove `@types/web-bluetooth` | ⬜ |
| Airplane-mode E2E | ⬜ |

### 04 — Pairing · `specs/04-pairing.md`

| Item | Status |
|---|---|
| Extract `lib/pairing/` — pure, deterministic | ⬜ |
| Seeded RNG; remove `Math.random()` | ⬜ |
| **Weighted cost model — no dropped teams** | ⬜ |
| Server-side authority + sync verification | ⬜ |
| Cross-tournament history (`opponents_faced`) | ⬜ |
| Separate `is_bye` from `is_public_speaking` | 🔴 D8 |
| **Break calculation** | ⬜ |
| **Bracket generation, seeded** | ⬜ |
| Allow rematches in elims | ⬜ |
| Write `eliminated_in_round` | ⬜ |
| Persist standings | ⬜ |
| Declared judge clashes + UI | ⬜ |
| Validate manual overrides | ⬜ |
| Fix "Generate All Fold Rounds" history | ⬜ |
| Make method selector functional | ⬜ |
| Implement `getPairingStats` | ⬜ |
| Real room records | ⬜ |
| Remove dead in-bundle tests | ⬜ |
| **Property tests at 3 scales** | ⬜ |

### 05 — Rankings · `specs/05-rankings.md`

| Item | Status |
|---|---|
| **Shared `isTournamentCountable` predicate** | ⬜ |
| **Gate global rankings on release** | ⬜ |
| Filter to submitted ballots only | ⬜ |
| Filter to completed tournaments | ⬜ |
| **Delete `Math.random()` rank changes** | ⬜ |
| Real rank deltas from snapshots | ⬜ |
| Fix `tournamentsCount` | ⬜ |
| Separate in-tournament vs league-wide layers | ⬜ |
| School tiers (Elite/Advanced/Developing/Beginner) | 🔴 D1 |
| League-wide weights | 🔴 D1 |
| Eliminate full-table scans | ⬜ |
| Fix duplicated ranking computation | ⬜ |
| Ranking snapshots at release | ⬜ |
| Load test at round-end concurrency | ⬜ |

### 05b — Finance · `specs/05b-finance.md`

| Item | Status |
|---|---|
| Payment status tracking UI | ⬜ |
| Student payment confirmation | ⬜ |
| Waiver codes under concurrency | ⬜ |
| Duplicate-submission protection | ⬜ |
| School data isolation test | ⬜ |
| Offline payment recording | ⬜ |
| Index financial queries | ⬜ |

### 06 — Mobile · `specs/06-mobile.md`

| Item | Status |
|---|---|
| `ResponsiveTable` card-per-row pattern | ⬜ |
| Full-screen mobile dialogs | ⬜ |
| Ballot / timer / flowing at 360px | ⬜ |
| Pairings at 360px | ⬜ |
| Rankings at 360px | ⬜ |
| Teams / users / students lists | ⬜ |
| Analytics dashboards | ⬜ |
| Tournament creation form | ⬜ |
| Playwright 360px in CI | ⬜ |
| Real low-end Android verification | ⬜ |

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
