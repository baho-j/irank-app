# iRank — Working Agreement

iRank is the iDebate Rwanda League Management System. Next.js (App Router) frontend on Vercel, Convex backend.

## Code quality

Write clean code following best practices. **Use comments sparingly.** If you find yourself writing a paragraph-long comment explaining why the code does what it does, that is a signal the code itself is wrong — fix the code instead of explaining it.

Prefer self-documenting names, small functions, and clear structure. Reserve comments for genuine non-obvious context: external constraints, spec citations (e.g. a WSDC rule), or protocol quirks.

**No shortcuts.** When a deadline and the quality bar conflict, the deadline moves. Do not propose a partial implementation to hit a date — propose moving the date.

## Domain rules

### World Schools scoring is the only supported format

The judges' ballot implements WSDC strictly, per `WS-Scoring-Guide-1 (1).pdf` and `WSDC Scoring Rubric (1).pdf` in the repo root:

- Style 40% (24–32), Content 40% (24–32), Strategy 20% (12–16)
- Substantive speech total **60–80**, average 70 (28 / 28 / 14)
- Reply speeches **halved**: 30–40, average 35
- **Half marks are the lowest fraction allowed**
- Points of Information: modifier of **±2**, never pushing the total outside 60–80
- **No low-point wins, no draws** — the winning team's total must exceed the losing team's

These are rulebook constants, not product decisions. Do not tune or "simplify" them.

Other formats (BritishParliamentary, PublicForum, LincolnDouglas, OxfordStyle) show a "Coming soon" badge and are blocked from selection: pairing, ballots, and breaks all assume the World Schools two-team model.

### Ballot vs ranking separation

Attendance, participation points inherited from the school, and school-tier criteria belong to the **league-wide ranking layer only**. They must never appear on the judges' ballot, and never in in-tournament standings.

- **In-tournament standings**: WSDC speaker points and wins only.
- **League-wide rankings**: performance + attendance + participation + school tier.

### Ranking release gating

A tournament's results must not reach any global ranking or leaderboard until `ranking_released` is set for that scope and role. Every global query must filter on it, on completed tournaments, and on submitted (not draft) ballots.

## Architecture constraints

- **Offline is a first-class requirement.** All in-tournament operations — pairing, ballots, rankings, payments, registration — must work with no connectivity and sync when it returns. Convex's own mutation queue is in-memory and does not survive a reload; the durable outbox is ours.
- **The pairing algorithm is isomorphic and deterministic.** One pure module runs on both device and server. No `Date.now()` or unseeded randomness inside it — the server re-runs it on sync and verifies the output matches.
- **Never trust the client as the authority.** Anything a device computes offline is re-verified on sync.
- **No secrets in `NEXT_PUBLIC_*`.** Third-party API keys belong in Convex actions.

## Testing

Nothing is "done" without a test. "Verified" means demonstrated against real (not demo) data, per the contract's acceptance standard.
