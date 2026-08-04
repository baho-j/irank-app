# 06 — Mobile Responsiveness

**Phase:** 1

## Deliverable

> **Mobile responsiveness audit across the whole system, not just the ballot** — Representatives, Judges, and Patrons overwhelmingly use phones, not desktops.

> Full functionality on common Android phones/tablets, not just desktop browsers.

---

## Current state

### The shell is genuinely good

`app/(main)/layout.tsx` handles mobile properly: `max-w-full overflow-x-hidden`, padding `px-4 md:px-6`, breadcrumb hidden below `md`. `components/ui/sidebar.tsx:201` renders a **Sheet drawer on mobile** (`SIDEBAR_WIDTH_MOBILE = 18rem`) and an icon rail on desktop. `app-sidebar.tsx` adds an explicit mobile close button. `site-header.tsx` progressively hides chrome.

Your assessment was right: the navbar is done well.

### Everything inside it is not

**The structural root cause: `sm:` (640px) is essentially unused.** The smallest breakpoint the app reaches for is `md:` (768px) — *above every phone in portrait*. There is no design at all between 320px and 768px.

| File | Lines | sm/md/lg | Tables | Verdict at 360px |
|---|---|---|---|---|
| `tournament-pairing.tsx` | 3215 | 0 / 4 / 7 | 26 | Worst |
| `tournament-ranking.tsx` | 1390 | 0 / 1 / 8 | 99 | Broken |
| `tournament-teams.tsx` | 1183 | 0 / 4 / 5 | 59 | Broken |
| `admin/users/page.tsx` | 987 | 1 / 3 / 2 | 42 | Broken |
| `school/students/page.tsx` | 977 | 1 / 3 / 4 | 40 | Broken |
| `tournament-overview.tsx` | 1779 | **0 / 0 / 4** | 0 | Broken |
| `tournament-ballot.tsx` | 3964 | 29 / 50 / 11 | 17 | Best, still overflows |
| `admin/dashboard/page.tsx` | 300 | 0 / 25 / 3 | 0 | **Fine** |
| `student/dashboard/page.tsx` | 440 | 0 / 23 / 1 | 0 | **Fine** |

Concrete failures:

- **Pairings** (`tournament-pairing.tsx:1155-1164`) — a 7-column table with two `w-80` columns. **640px of fixed width alone on a 360px screen.** Plus `grid grid-cols-2 lg:grid-cols-5` (line 2536) where 2 columns is the floor, and a fixed `max-h-[600px]` scroll region taller than many phone viewports.
- **Rankings** (`tournament-ranking.tsx:849-857`) — a 9-column table, and `grid-cols-4` tab lists crammed unprefixed into 360px.
- **Overview** — zero `sm:` or `md:` prefixes in 1,779 lines; unprefixed `grid-cols-2` and `grid-cols-3` throughout.
- **Lists** — fixed-pixel truncation (`max-w-[70px]` … `max-w-[250px]`) instead of responsive column dropping. No `hidden md:table-cell` anywhere.

### Tables scroll, but that is not a design

`components/ui/table.tsx` wraps every table in `overflow-auto`, so tables scroll horizontally rather than breaking layout. Good — but with 7–9 columns at fixed widths, mobile users get a tiny scrolling peephole. **There is no card-per-row alternative anywhere in the codebase.**

### Dialogs are never full-screen on mobile

`components/ui/dialog.tsx:41` — `w-full max-w-lg ... p-6`. On a 360px screen `p-6` leaves 312px usable. Call sites are desktop-sized: `max-w-6xl`, `max-w-7xl` (ballot), `max-w-2xl`/`max-w-4xl` (pairing), several `max-h-[80vh] overflow-y-auto` forms that get cramped on short viewports.

`vaul` (drawer) is installed and used **exactly once**, in the ballot.

### The mobile hook is barely used

`hooks/use-mobile.tsx` (`useIsMobile()`, 768px) is consumed in **one file**: `components/ui/sidebar.tsx:76`. No page or feature component uses it. There is no `use-media-query`.

The custom `custom: 1230px` breakpoint in `tailwind.config.ts` is a *desktop* breakpoint and does nothing for phones.

---

## Target state

Every screen usable on a 360px viewport, prioritizing what judges and representatives actually use in a venue.

## Design

**Mobile-first, not desktop-retrofitted.** Start layouts at the smallest size and add `sm:`/`md:` upward. The current pattern — desktop layout with a few `lg:` overrides — is what produced this.

**Card-per-row pattern for data tables.** A shared `ResponsiveTable` rendering table rows on wide screens and stacked cards below `sm`, with column priority declared per table so secondary fields collapse behind a disclosure. Built once, applied to pairings, rankings, teams, users, students.

**Full-screen dialogs on mobile.** Extend `DialogContent` to go edge-to-edge full-height below `sm`, or route through `vaul` Drawer. Reduce padding at small sizes.

**Ship `useIsMobile` beyond the sidebar** where behaviour (not just layout) must differ.

**Order of work — judge-facing first**, since those are used in-venue on low-end devices:
1. Ballot, timer, flowing
2. Pairings / draw view
3. Rankings and standings
4. Teams, users, students lists
5. Analytics dashboards
6. Long forms (tournament creation)

## Acceptance criteria

- [ ] No horizontal page scroll at 360px on any screen
- [ ] Every data table has a usable mobile presentation — not a horizontal peephole
- [ ] Dialogs are full-screen or drawer-based below `sm`
- [ ] Ballot entry is fully usable one-handed on a 360px screen
- [ ] Tap targets meet minimum size on all interactive controls
- [ ] Playwright runs the judge-facing flow at 360px in CI
- [ ] Verified on a real low-end Android device, not only emulation
- [ ] Works in landscape as well as portrait
- [ ] No fixed-pixel widths exceeding the viewport remain

## Out of scope

- Animation and feedback → `06b-motion.md`
- Offline behaviour on device → `03-offline.md`
