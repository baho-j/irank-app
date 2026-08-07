# Ranking Model — Weights and Thresholds

> **STATUS: SIGNED OFF.** All open questions answered by the League Manager. These are now the specification; implementation is tracked in `05-rankings.md`.

---

## The two layers

**In-tournament standings** decide who wins and who breaks. WSDC speaker points and wins only — no attendance, no school criteria. Not configurable; this is the rulebook.

**League-wide rankings** decide season standing, tiers, and Regional eligibility. This is the layer the weights below govern.

The deliverable is explicit that participation and performance must be **added — not double-counted, and not missing one**:

> Team Rankings correctly combine participation points (inherited from the school) with round-by-round performance. Confirm the two figures are actually added together.

---

## 1. In-tournament team standings

Ordering, each tie broken by the next:

1. Wins
2. Total team points (sum of WSDC speaker scores)
3. Opponents' total wins — strength of schedule
4. Opponents' total points
5. Head-to-head result
6. Team name (stable, deterministic)

### A — Bye credit ✅

**A bye counts as a win.** Speaker points for the bye are the team's **average across the rounds they actually debated, computed per stage**:

- A bye in prelims is credited at the end of prelims, averaged over that team's *other prelim rounds only*.
- A bye in elims is credited at the end of elims, averaged over that team's *other elim rounds only*.

The two stages never mix. Because the credit depends on rounds not yet debated, **bye points are computed at stage end, not at the moment the bye is assigned** — standings shown mid-stage must treat the bye as a win with points still pending, rather than as zero.

---

## 2. In-tournament speaker standings

### B — Ranking basis ✅ (differs by tournament scope)

iDebate confirmed these are genuinely different competitions:

| Scope | Basis | Threshold |
|---|---|---|
| **Local** | **Total** speaker points — a speaker in more debates is *intentionally* favoured | none |
| **International** | **Average** speaker score | **none** — explicitly no minimum-debates threshold |

The proposed minimum-debates threshold was **rejected**. Ranking basis is therefore a property of the tournament, not a global constant, resolved through `tournaments.league_id` → `leagues.type`.

Remaining tiebreakers, unchanged: team wins → highest individual score → lowest points deviation → name.

---

## 3. League-wide school ranking

```
School Score = (Performance × 0.50) + (Attendance × 0.40) + (Hosting × 0.10)
```

| Component | Weight |
|---|---|
| Performance | **50%** |
| Attendance | **40%** |
| Hosting | **10%** |

**Note:** the earlier three-way split of performance/participation/attendance is superseded. Participation is no longer a separate component — **attending tournaments and SLDs is now counted under Attendance**, and **Hosting means hosting only**, as the word implies.

### Performance sub-score
Normalised 0–100 from: average team finishing position, teams reaching elims, best elimination progression, and speakers in the top 10/20.

### C — Normalising by teams entered ❌ REJECTED

Current behaviour sorts on raw `total_wins` then `total_points`, so a school entering 10 teams outranks one entering 2. **This stays as it is.** Do not normalise per team entered.

### Attendance sub-score
Everything a school shows up to: tournaments attended, SLDs participated in, club competitions run. Registered-and-attended versus registered-and-absent.

### D — No-show penalty ❌ REJECTED

A no-show and a notified withdrawal are weighted **the same for now**. The proposed 2× penalty is not adopted.

### Hosting sub-score
SLDs and competitions **hosted** by the school. Hosting only.

---

## 4. School tiers ✅

Elite / Advanced / Developing / Beginner, derived automatically from live data. **Currently not implemented at all.**

### E — Percentile thresholds ✅

| Tier | Band |
|---|---|
| Elite | Top 10% |
| Advanced | Next 25% |
| Developing | Next 40% |
| Beginner | Remainder |

Self-balancing as the league grows; a school can drop as others improve. **With an activity floor:** a school cannot reach Elite without a minimum of **3 verified activities**, so a single strong tournament cannot top the tier on a tiny sample.

### F — Tier change damping ✅

Recalculate continuously, but a school must sit at a new tier for **two consecutive evaluations** before the change takes effect. Display the tier as of the last committed change, with a **provisional** indicator when the pending evaluation differs.

---

## 5. League-wide student ranking

```
Student Score = (Speaker performance × 0.80) + (Participation × 0.20)
```

Performance from WSDC scores across **released** tournaments only. Participation from debates spoken.

### G — No school inheritance ✅

A student is ranked on their **own speaking**. School tier and school participation do not feed a student's ranking — otherwise a strong speaker at a low-activity school is penalised for something outside their control. School inheritance applies to team and school rankings only.

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

## Decisions — all resolved

| # | Question | Decision |
|---|---|---|
| A | Bye credit | Win + average of that team's **other rounds in the same stage**, computed at stage end |
| B | Speaker ranking basis | **Local: total. International: average, no threshold.** |
| C | Normalise school performance by teams entered | **No — keep current behaviour** |
| D | No-show vs withdrawal penalty | **Same for now** |
| E | Tier thresholds | Percentile 10/25/40/rest, with a 3-verified-activity floor for Elite |
| F | Tier change damping | Two consecutive evaluations, provisional indicator |
| G | Student inherits school participation | **No** |
| — | School weights | **Performance 50 / Attendance 40 / Hosting 10** |

These become typed constants in one configuration module, changeable without touching ranking logic, and covered by tests asserting each component is applied exactly once.

---

## Implementation notes

Two decisions have structural consequences beyond a constants file:

1. **Local vs international ranking basis (B)** uses the existing `leagues.type` (`Local | International | Dreams Mode`, `schema.ts:168`) reached through `tournaments.league_id`. **No new field is required** — confirmed against the schema. `02b-team-lineups.md` gates squad rotation on the same lookup.

2. **Stage-end bye credit (A)** means speaker points for a bye are not knowable when the bye is assigned. Standings computed mid-stage must represent a bye as *win, points pending* rather than as zero points, or the affected team will appear to be losing ground until the stage closes.
