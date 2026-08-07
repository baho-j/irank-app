# 04 — Pairing Engine, Breaks, and Brackets

**Phase:** 1 · **Depends on:** `03-offline.md` (local store), `00-foundations.md` (tests)

## Deliverable

> Draw/pairing generation for each round runs correctly: **no repeat pairings within the same tournament**, correct room and motion assignment, and a working manual-override option for the Tab team when needed.

> Judge panel assignment respects conflicts of interest: a judge cannot be assigned to a room containing their own school, a school they coach, or any other declared clash. **Confirm the clash list is actually checked, not just stored.**

> Live results aggregation correctly rolls up ballots into round results, cumulative team/speaker standings, and **break calculations for the next round. Confirm the break line and qualifying teams calculate correctly against real sample data, not just small test cases.**

---

## Current state

`lib/pairing-algorithm.ts` — 1,149 lines, **running in the browser**, including ~360 lines of dead `console.assert` tests shipped in the production bundle. `convex/functions/pairings.ts::savePairings` persists whatever the client sends and re-derives nothing, so **a modified client can save arbitrary pairings**.

### Teams are silently dropped from rounds

`lib/pairing-algorithm.ts:218-252`:

```ts
for (const oppTeam of oppPool) {
  if (pairedOpp.has(oppTeam._id)) continue;
  if (propTeam.opponents_faced.includes(oppTeam._id)) continue;              // hard skip
  if (propTeam.school_id && propTeam.school_id === oppTeam.school_id) continue; // hard skip
  ...
}
if (bestOpponent) { existingPairings.push({...}); }
// no else — the team is never paired, and nothing reports it
```

Repeat-opponent and same-school are **hard filters with no fallback**. When no opponent survives them, the team is simply omitted from the round. The constructor logs an expected pairing count (line 90) that nothing asserts against. This is the likely source of the duplicate/missing pairings you observed.

### No cross-tournament history

`getTournamentPairingData` reads debates via `by_tournament_id` only. `teams.opponents_faced` — which has a `round_type` field and could persist history — is **never written**; history is recomputed per tournament from `debates`. `cross_tournament_performance` is hardcoded to zeros at `convex/functions/pairings.ts:240-245` and never influences any decision.

### Bye is conflated with public speaking

`savePairings:621` writes `is_public_speaking: pairing.is_bye_round`, and `getTournamentPairingData` reads byes back as `d.is_public_speaking`. The two concepts share one flag, so a genuine public-speaking event is counted as a bye and vice versa. Bye teams are credited no win.

### No breaks, no brackets — the largest gap

Nothing computes "top N teams break." When Tab generates round `prelim_rounds + 1`, `getTournamentPairingData` returns **all active teams** and the Swiss branch pairs all of them — a 32-team tournament produces 16 "quarterfinals."

- `teams.eliminated_in_round` is read in six places and **never written**, so it is always `undefined`.
- `prelim_wins` / `prelim_points` / `elimination_wins` / etc. are declared in schema and **never written**; standings are recomputed from `debates` on every read.
- Elimination rounds re-run the same Swiss loop with the repeat-opponent skip still active — exactly backwards, since rematches are normal in elims.
- `savePairings` types rounds `preliminary` or `elimination` and never `final`, contradicting `createTournament`.

### Other defects

- **Method selector is decorative.** `tournament-pairing.tsx:1736-1740` computes a method, toasts about it, then calls the algorithm, which re-derives method internally as `roundNumber <= 5 ? 'fold' : 'swiss'`.
- **Manual override skips validation.** `updatePairing` guards status and self-pairing but **not** repeat opponents or school clash.
- **"Generate All Fold Rounds" ignores played debates** — `tournament-pairing.tsx:1571-1588` initializes every team with empty `side_history` / `opponents_faced` / `bye_rounds`, so it will happily recreate matchups that already happened.
- **`getPairingStats` is a stub** returning hardcoded zeros (`pairings.ts:863-870`), fed into recommendations that therefore always report "Perfect pairing quality achieved!"
- **Round 1 uses unseeded `Math.random()`** — not reproducible.
- **Unindexed full scans**: `judging_scores` and `judge_feedback` via `.collect()` (`pairings.ts:110-111`).

---

## Target state

### Isomorphic and deterministic

Pairing must work with no connectivity, yet the server must remain the authority. Both hold if the algorithm is **one pure module (`lib/pairing/`) running in both places**:

- **Offline** — the Tab device runs it locally; the round proceeds.
- **Online** — the identical module runs inside a Convex mutation as the authority.
- **On sync** — the server re-runs it against the submitted input snapshot and verifies the output matches. Mismatches are rejected and surfaced to Tab.

Determinism is load-bearing:

- **Seeded RNG** — the seed is part of the round record, so a draw is reproducible.
- **No `Date.now()`** inside the algorithm; time is an explicit input.
- **Stable sort keys and total ordering** on every tie-break — no reliance on input order.
- **No Convex or React imports.** Plain TypeScript over explicit input/output types, which is also what makes it testable.
- The input snapshot is hashed so "same inputs" is verifiable rather than assumed.

### Weighted cost model replaces hard filters

Constraints become **weighted penalties**, not `continue` statements:

| Factor | Treatment |
|---|---|
| Repeat opponent (this tournament) | High penalty |
| Repeat opponent (prior tournaments) | Moderate penalty, decaying with age |
| Same school | Very high penalty |
| Side imbalance | Moderate penalty |
| Bracket/performance distance | Primary objective |
| Prior bye | Penalty on repeat byes |

A team is **never** silently dropped. If every option is costly, the least-bad pairing is chosen and **explicitly surfaced to Tab** with the constraint it violated. Global cost minimization, not greedy first-fit.

### Cross-tournament history

Actually write and read `teams.opponents_faced`, so prior-tournament matchups are penalized as you expect. Cross-tournament data is an explicit, testable input.

### Breaks and brackets

New:

- **Break calculation** — top N advancing, with the tiebreak chain from `05-rankings.md`, respecting `prelim_rounds`. The break line is explicit and reviewable before elims generate.
- **Bracket generation** — seed from the break (1v16, 2v15, …), winner advances, correct round typing including `final`.
- **Rematches allowed in elims** — the repeat-opponent penalty does not apply.
- **Write `eliminated_in_round`** and persist standings instead of recomputing on every read.

### Judges

Keep the existing same-school and feedback-derived conflicts. Add:

- Declared clashes (coaching, alumni, personal) in a real table with a manual entry UI — the deliverable requires the clash list be *checked*, not merely stored.
- Cross-tournament conflict memory.
- Re-validate conflicts on **manual override**.

### Rooms and byes

- Real room records with capacity, replacing the `Room ${counter++}` stub.
- **Separate `is_bye` from `is_public_speaking`**; decide and document bye win-credit policy.

---

## Acceptance criteria

**The deliverable is the test suite.** Property-based plus fixtures at small (6–8), medium (24–32), and large (64+) team counts.

**Invariants — must hold for every generated round**
- [ ] Every active team appears in exactly one debate, or has an explicit, recorded bye
- [ ] No team appears twice in a round
- [ ] No repeat pairing within a tournament unless explicitly surfaced as unavoidable
- [ ] Side balance stays within tolerance across the tournament
- [ ] No judge shares a school with either team
- [ ] No judge has a declared clash with either team
- [ ] Byes are distributed fairly; no team gets two before others get one
- [ ] Odd team counts handled at every size

**Determinism**
- [ ] Same inputs + same seed → byte-identical output, across device and server
- [ ] Server re-run reproduces an offline-generated draw
- [ ] A tampered pairing payload is rejected on sync

**Breaks and elims**
- [ ] Break line correct against real sample data, not just small cases
- [ ] Bracket seeding is structurally valid at 4, 8, 16, 32 breaking teams
- [ ] Rematches permitted in elims
- [ ] `eliminated_in_round` written correctly; the final round types as `final`

**Manual override**
- [ ] Tab can override any pairing
- [ ] Overrides are validated for clashes and repeats, with warnings surfaced
- [ ] Overrides are audited

**Regressions**
- [ ] "Generate All Fold Rounds" respects already-played debates
- [ ] The method selector actually selects the method
- [ ] `getPairingStats` reports real metrics
- [ ] No full-table scans on the pairing path

---

## Out of scope

- Ballot scoring feeding standings → `02-ballot.md`
- Ranking tiebreak definitions → `05-rankings.md`
- Local persistence → `03-offline.md`
