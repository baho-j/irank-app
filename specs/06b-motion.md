# 06b — Motion, Feedback, and Confetti

**Phase:** 1 · **Depends on:** `06-mobile.md` (performance verification)

## Current state

`framer-motion@^12.12.1` is installed but used sparingly and inconsistently — animation decisions are made ad hoc per component, so feedback differs between screens.

**Confetti does not exist anywhere in the codebase.** No library, no component, no dead code. A repo-wide search returns nothing.

So: nothing is broken, and there is nothing to repair. This is new work.

## Target state

Consistent, purposeful motion that tells the user what happened — never decoration for its own sake, and never something that delays the underlying action.

## Design

### Shared animation layer

`lib/motion/` holding the vocabulary: durations, easings, and named variants (enter, exit, success, error, pending). Components consume these rather than hand-rolling values, so feedback is uniform.

Keep it small. A handful of well-chosen tokens beats a large library of one-off variants.

### Where motion earns its place

| Moment | Feedback |
|---|---|
| Ballot submitted | Success confirmation — the judge must be certain it landed |
| Outbox / sync state change | Queued → syncing → synced, with real counts (`03-offline.md`) |
| Peer reconciliation accept/decline | Per-item response so the reviewer sees what they acted on |
| Rank change | Direction of movement — **real deltas only**, never the `Math.random()` values being deleted in `05-rankings.md` |
| Queue drain progress | Honest progress, since this can take time on poor connections |
| Validation failure | Draw attention to the offending field, e.g. a low-point-win block |

### Confetti — milestones only

Reserved for genuine achievements, so it keeps meaning:

- Ballot submitted (the judge's work is done)
- Tournament won
- Break announced — a team advancing to elims
- Achievement/badge unlocked on the user-facing side

Not for routine saves, navigation, or form submissions.

Implemented with a lightweight canvas confetti library rather than framer-motion, which is the wrong tool for particles. Must not block interaction, and must clean up its canvas.

### Non-negotiables

- **`prefers-reduced-motion` respected throughout.** Reduced motion means the state change is still communicated — instantly or via a static indicator — never that feedback disappears.
- **Motion never gates an action.** Animations are feedback *about* work, never a step *in* it. No awaiting an animation before a mutation dispatches, and no blocking navigation on an exit transition.
- **60fps on low-end Android.** Transform and opacity only; no animating layout properties. Verified on a real device as part of `06-mobile.md`, not assumed.
- **Interruptible.** A user acting mid-animation is never blocked or forced to wait.

## Acceptance criteria

- [ ] One shared animation vocabulary; no ad hoc durations/easings in components
- [ ] Ballot submission gives unmistakable success feedback
- [ ] Sync and outbox states are visually distinct and reflect real queue counts
- [ ] Reconciliation accept/decline gives immediate per-item feedback
- [ ] Rank indicators animate from real computed deltas
- [ ] Confetti fires only on the defined milestones
- [ ] `prefers-reduced-motion: reduce` disables motion while preserving the information
- [ ] No animation blocks, delays, or gates any mutation or navigation
- [ ] 60fps sustained on a low-end Android device
- [ ] Animations are interruptible

## Out of scope

- Responsive layout → `06-mobile.md`
- Sync mechanics → `03-offline.md`
- Rank delta computation → `05-rankings.md`
