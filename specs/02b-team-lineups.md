# 02b — Per-Round Team Lineups (International)

**Phase:** 1 · **Depends on:** `02-ballot.md`

## The requirement

At international tournaments a school registers a **squad larger than a team**. A team fields 3 speakers per debate, but the school may register 5 and rotate: three speak in round 1, then two are swapped out for the other two in round 2.

The tab team must be able to set, per round, **which registered students are speaking and in which position** (first / second / third / reply).

**International tournaments only.** Local tournaments keep fixed rosters.

## Current state

`teams.members` (`convex/schema.ts:281`) is a flat `v.array(v.id("users"))` with no notion of a round. `tournaments.team_size` is a single number. There is no way to express "these 3 of our 5 are speaking this round", and no per-round position assignment — the ballot infers speakers from the team's whole member list.

So this is **not implemented in any form**, not a partial feature to extend.

## Target state

- A team may register more members than `team_size`.
- For each round, the lineup is the subset actually speaking, each with a position.
- The ballot is pre-populated from that round's lineup, so a judge never sees a student who is not speaking and never types a name.
- Speaker rankings count only debates a student actually spoke in — a squad member who sat out a round accrues nothing for it, which matters directly for the average-based international ranking in `ranking-model.md`.

## Design

Add a `team_lineups` table keyed by `(debate_id, team_id)`:

```
team_lineups: {
  debate_id, team_id, tournament_id,
  speakers: [{ speaker_id, position: "first"|"second"|"third"|"reply" }],
  set_by, set_at
}
```

Keyed on debate rather than round because a team plays one debate per round, and the ballot already loads by debate — this avoids a second lookup on the judge's critical path.

Rules:
- Lineups are only editable when the tournament's league is `International`; otherwise the roster is fixed and the lineup is derived from `members`.
- Every speaker in a lineup must be a registered member of that team.
- A position may not be assigned twice in one lineup.
- Lineup size must equal `tournaments.team_size`, matching what `scoreBallot` already enforces on submission.
- Changing a lineup after that debate's ballots are submitted is blocked, since it would silently reattribute scores.
- Absent a lineup, the ballot falls back to `members` in order, preserving current behaviour for local tournaments.

**No new field is needed.** `leagues.type` is already `Local | International | Dreams Mode` (`convex/schema.ts:168`), and `tournaments.league_id` links to it. Rotation is permitted when the tournament's league is `International`; the same lookup answers the local-versus-international speaker ranking basis in `ranking-model.md` decision B.

### Speakers per team

`tournaments.team_size` (`schema.ts:223`) is the number of speakers a team fields, validated at creation as 1–5 with a World Schools cap of 3 (`admin/tournaments.ts:88-92`). It was **not** enforced anywhere on the ballot — the ballot rendered every entry in `teams.members`, so a 5-person squad would have presented five speakers to score.

`scoreBallot` now requires exactly `team_size` substantive speeches per team, and rejects a speaking position used twice within a team. Reply speeches are counted separately so they do not violate the substantive count. A lineup must therefore satisfy the same rule: exactly `team_size` speakers, each in a distinct position.

## Acceptance criteria

- [ ] A school can register more students than `team_size` at an international tournament
- [ ] Tab can set a per-round lineup with positions
- [ ] The ballot pre-populates from that round's lineup
- [ ] A student not in the lineup cannot be scored for that round
- [ ] Rotation is rejected for tournaments that do not permit it
- [ ] Duplicate positions, non-members, and wrong-sized lineups are rejected
- [ ] Lineup changes are blocked once ballots for that debate are submitted
- [ ] Speaker rankings count only rounds a student actually spoke in
- [ ] Teams without a lineup behave exactly as they do today

## Out of scope

- Which students a school may register → existing registration flow
- Whether rotation affects break eligibility → confirm with iDebate if it arises
