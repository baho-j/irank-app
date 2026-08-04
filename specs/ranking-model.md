# Ranking Model — Weights and Thresholds

> **STATUS: AWAITING SIGN-OFF.** Every number below is a *proposal*. Nothing here is implemented until you confirm or amend it. These numbers determine who gets national recognition, so they should be a deliberate decision, not a developer default.

Implementation is tracked in `05-rankings.md`.

---

## The two layers

**In-tournament standings** decide who wins and who breaks. WSDC speaker points and wins only — no attendance, no school criteria. Not configurable; this is the rulebook.

**League-wide rankings** decide season standing, tiers, and Regional eligibility. This is the layer the weights below govern.

The deliverable is explicit that participation and performance must be **added — not double-counted, and not missing one**:

> Team Rankings correctly combine participation points (inherited from the school) with round-by-round performance. Confirm the two figures are actually added together.

---

## 1. In-tournament team standings (fixed)

Ordering, each tie broken by the next:

1. Wins
2. Total team points (sum of WSDC speaker scores)
3. Opponents' total wins — strength of schedule
4. Opponents' total points
5. Head-to-head result
6. Team name (stable, deterministic)

This matches current behaviour (`rankings.ts:352-374`) and is retained.

**Open question A — bye credit.** A bye currently credits **no win** and is excluded from standings, which is non-standard; most formats award a win with average speaker points. `04-pairing.md` needs this decided.
→ **Proposed: a bye awards a win and speaker points equal to the team's tournament average.**

---

## 2. In-tournament speaker standings (fixed, one change proposed)

1. Total speaker points
2. Team wins
3. Highest individual score
4. Lowest points deviation (consistency)
5. Name

**Open question B.** Current code ranks by *total* points, so a speaker in more debates outranks a better speaker in fewer — a real distortion when teams play unequal counts (byes, withdrawals, elims).
→ **Proposed: rank by average speaker score, with a minimum-debates threshold (proposed: 3) to qualify.** Total remains a tiebreak.

---

## 3. League-wide school ranking (needs sign-off)

```
School Score = (Performance × Wp) + (Participation × Wc) + (Attendance × Wa)
```

**Proposed weights — please confirm or amend:**

| Component | Weight | Rationale |
|---|---|---|
| Performance | **50%** | Competitive results should dominate but not exclude developing schools |
| Participation | **35%** | The league's stated purpose is growth; showing up and hosting must count materially |
| Attendance/reliability | **15%** | Rewards turning up as committed without overwhelming merit |

### Performance sub-score
Normalized 0–100 from: average team finishing position, teams reaching elims, best elimination progression, and speakers in the top 10/20.

**Open question C.** Current school ranking sorts on raw `total_wins` then `total_points` (`rankings.ts:549-584`), **not normalized by teams entered** — so a school entering 10 teams beats a school entering 2 regardless of quality.
→ **Proposed: normalize per team entered,** with a separate volume credit under Participation, so entering more teams is rewarded once (as participation) rather than twice.

### Participation sub-score
From the Phase 2 verified-activity data (`07-phase2.md`): club competitions run, SLDs hosted, SLDs participated in, tournaments attended.

Counts only activities at status **Verified**. Until Phase 2 ships, this reads tournament participation only, and the spec must say so rather than showing a misleadingly complete figure.

### Attendance sub-score
Registered-and-attended vs registered-and-absent. Withdrawals notified in advance penalized less than no-shows.

**Open question D — proposed: a no-show costs 2× a notified withdrawal.**

---

## 4. School tiers (needs sign-off)

Elite / Advanced / Developing / Beginner. **Currently not implemented at all.** Must be derived automatically from live data.

**Open question E — absolute or relative thresholds?**

| Option | Behaviour |
|---|---|
| **Percentile (proposed)** | Top 10% Elite, next 25% Advanced, next 40% Developing, rest Beginner. Self-balancing as the league grows; a school can drop as others improve. |
| Absolute | Fixed score cut-offs. Stable and predictable; needs manual recalibration and may leave tiers empty or overfull. |

→ **Proposed: percentile-based, with a floor** — a school cannot be Elite without a minimum activity count (proposed: 3 verified activities), preventing a one-tournament school from topping the tier on a tiny sample.

**Open question F.** How quickly may a school change tier? Instant recalculation can make tiers flap.
→ **Proposed: recalculate continuously but require two consecutive evaluations at a new tier before it changes, and display the tier as of the last change with a "provisional" indicator.**

---

## 5. League-wide student ranking (needs sign-off)

```
Student Score = (Speaker performance × 0.80) + (Participation × 0.20)
```

Performance from WSDC scores across **released** tournaments only. Participation from debates spoken.

**Open question G.** Should a student's ranking inherit anything from their school's tier or participation? The deliverable mentions participation points "inherited from the school" for *team* rankings.
→ **Proposed: no.** A student is ranked on their own speaking. School inheritance applies to team and school rankings only — otherwise a strong speaker at a low-activity school is penalized for something outside their control.

---

## 6. Team ranking — the explicit double-count risk

```
Team Score = Round-by-round performance + Participation points inherited from school
```

The deliverable calls this out specifically. Guard rails:

- Participation is inherited **once**, at the team level.
- It must not also be folded into the team's performance component.
- It must not be re-added per member.
- A test asserts: a team's score equals performance + inherited participation exactly, with both non-zero and neither counted twice.

---

## Decisions needed before implementation

| # | Question | Proposal |
|---|---|---|
| A | Bye credit | Win + average speaker points |
| B | Speaker ranking basis | Average, min 3 debates; total as tiebreak |
| C | Normalize school performance by teams entered | Yes |
| D | No-show vs withdrawal penalty | No-show costs 2× |
| E | Tier thresholds | Percentile (10/25/40/rest) + activity floor |
| F | Tier change damping | Two consecutive evaluations |
| G | Student inherits school participation | No |
| — | **Weights: 50 / 35 / 15** | Confirm or amend |

Once confirmed, these become typed constants in one configuration module, changeable without touching ranking logic, and covered by tests asserting each component is applied exactly once.
