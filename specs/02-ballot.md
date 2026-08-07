# 02 — WSDC Ballot Rebuild

**Phase:** 1 · **Depends on:** `00-foundations.md` (tests), `03-offline.md` (flowing persistence)

> The ballot is the single most important piece of evidence in the entire system: it decides who wins, who breaks, and who gets national recognition. **It must be rebuilt properly, not patched.**

---

## Deliverable

Section 3.3 and 3.4 of the deliverables document, in full — one ballot per judge/room/round, per-speaker scoring with validation, team ranking with low-point-win warnings, structured RFD, panel reconciliation, chair vs panelist roles, live submission state, post-submission locking with audit trail, and low-end device support. Plus live flowing notes with continuous auto-save.

---

## Current state

### The scoring formula is not WSDC

`convex/functions/volunteers/ballots.ts:307-335` (duplicated at `admin/ballots.ts:492-514` and `:306-327`, and again client-side at `tournament-ballot.tsx:162-176`):

```ts
const validateScore = (score: number, field: string): void => {
  if (score < 0 || score > 25) throw new Error(`${field} must be between 0 and 25`);
};

const rubricScore = speaker.role_fulfillment + speaker.argumentation_clash +
                    speaker.content_development + speaker.style_strategy_delivery;
const attendanceBonus = 5;
const totalRaw = rubricScore + attendanceBonus;
let finalScore = (totalRaw / 105) * 30;
if (finalScore < 16.3) finalScore = 16.3;
```

Every part of this conflicts with the rulebook:

| Problem | Consequence |
|---|---|
| Four invented categories at 0–25 | Not Style/Content/Strategy at 40/40/20 |
| Unconditional `attendanceBonus = 5` | Attendance is not a judging criterion, and it is not tied to any attendance record |
| Rescale to a 16.3–30 band | Not the 60–80 WSDC range |
| **Hard clamp at 16.3** | A speaker scoring 0/100 and one scoring 39/100 store an **identical** score |
| No reply-speech handling | Replies must be halved (30–40) |
| No half-mark constraint | Arbitrary fractions accepted |
| No low-point-win check | The winner may total fewer points than the loser |

### Other gaps

- **No RFD field.** The nearest thing is free-text `notes`, which is *also* the flag channel.
- **Flags are string-appends.** `admin/ballots.ts` writes `notes + "\n[ADMIN FLAG: reason]"` and detects with `notes?.includes("[FLAG:")`. Unflagging is a regex strip. There is no `flagged` column.
- **Submission state is one boolean.** `feedback_submitted` conflates "draft saved" with "final". Tab cannot distinguish Not Started from In Progress.
- **Panel reconciliation counts only submitted ballots but does not require a quorum** — a 3-judge panel is decided 1–0 by the first ballot in (`volunteers/ballots.ts:172-226`).
- **Even-panel ties leave `winning_team_id` undefined while setting `status: "completed"`** — rankings then skip the debate (`rankings.ts:253`) and round-completion never resolves.
- **No chair tiebreak** despite `head_judge_id` existing.
- **Ballot edits are logged as having occurred but prior values are not retained** — `audit_logs` gets `action: "ballot_submitted"` with no `previous_state`.
- **`position` is free-form `v.string()`** defaulted to the literal `"Speaker"` (`tournament-ballot.tsx:1305`).
- **The timer ignores `tournament.speaking_times`** and never persists; `debates.current_speaker`, `current_position`, `time_remaining` are dead fields.
- `components/tournaments/tournament-ballot.tsx` is **3,964 lines** — the largest file in the repo.

---

## Target state

### Scoring — strict WSDC

Single source of truth in `lib/scoring/wsdc.ts`, imported by client and server, replacing all four copies.

| Criterion | Weight | Range (substantive) |
|---|---|---|
| Style | 40% | 24–32 |
| Content | 40% | 24–32 |
| Strategy | 20% | 12–16 |
| **Total** | 100% | **60–80**, average 70 (28/28/14) |

- **Reply speeches**: all marks halved → **30–40**, average 35.
- **Half marks are the lowest fraction allowed.** Reject anything else at the mutation boundary.
- **Points of Information**: modifier of **±2**, clamped so the total never leaves 60–80.
- **No low-point wins, no draws.** The winning team's total must strictly exceed the losing team's; block submission with an explicit message otherwise.

Margin bands surfaced to the judge as guidance, not enforcement: 0–2 very close · 3–5 close but clear · 5–10 clearly better · 10–20 dominated · 20+ "shredded".

**Attendance and school criteria do not appear on the ballot.** They belong to league-wide rankings (`05-rankings.md`).

### Schema

Rewrite `judging_scores`:

```
speaker_scores[]: {
  speaker_id, team_id,
  position: union("first"|"second"|"third"|"reply"),
  speech_type: union("substantive"|"reply"),
  style, content, strategy,      // half-mark validated, range per speech_type
  poi_modifier,                  // -2..2
  total,                         // derived, stored for query performance
  comments
}
rfd: string                      // required, non-empty, min length enforced
submission_state: union("not_started"|"in_progress"|"submitted")
flagged: boolean
flag_reason: optional(string)
flagged_by: optional(id("users"))
ballot_edits[]: { editor_id, reason, previous_scores, previous_winner, timestamp }
```

Drop `role_fulfillment`, `argumentation_clash`, `content_development`, `style_strategy_delivery`, and the overloaded `feedback_submitted`.

**Migration required** — existing `judging_scores` rows use the old shape. Old scores cannot be faithfully converted (the 16.3 clamp destroyed information), so historical ballots are preserved read-only in an archive field and excluded from recomputation, with the limitation documented.

### Panel reconciliation

Extract the byte-identical `updateDebateResults` duplicates (`volunteers/ballots.ts:172`, `admin/ballots.ts:202`) into one shared module.

- Majority across **submitted** ballots, and only once **all** assigned judges have submitted — no deciding a 3-judge panel on one ballot.
- Even-panel tie → **chair judge decides**. Never leave `winning_team_id` undefined on a `completed` debate.
- **Splits are flagged for Tab review, never averaged away.** Team points remain the mean, but the split is recorded and surfaced.
- Chair vs panelist distinguished in the workflow.

### Submission state and locking

- Tab sees live per-room **Not Started / In Progress / Submitted**.
- On submit, the ballot locks against judge edits.
- Post-submission correction goes through a Coordinator with a **logged reason and timestamp, capturing previous values** — an audit trail, never a silent overwrite.

### Format gating

Only `WorldSchools` is selectable. The other four formats render a **"Coming soon"** badge and are blocked at both the creation form and the mutation, because pairing, ballots, and breaks all assume the two-team model. `debates` has exactly `proposition_team_id` and `opposition_team_id`, so BP's four-team structure is not merely unimplemented but structurally impossible today.

### Flowing notes

Per deliverables 3.4, built on `03-offline.md`:

- Saves **automatically and continuously** while typing. No manual save at any point.
- **Timestamped and structured per speaker/speech**, so notes stay attached correctly when the judge jumps between speakers.
- Retained locally the instant they are typed; synced when connectivity returns.
- **Crash/close/restart restores the in-progress flow exactly where the judge left off.**
- Feeds directly into that judge's RFD and scoring, so nothing is retyped.

### Timer

Wire to `tournament.speaking_times`. Standard warnings (protected time, overtime). Persist `current_speaker` / `current_position` / `time_remaining`. Must work on an unstable connection and survive reload.

### Decomposition

`tournament-ballot.tsx` (3,964 lines) is split as part of this work: scoring form, flowing panel, timer, RFD, panel status, submission flow. Not deferred.

---

## Acceptance criteria

**Scoring**
- [ ] Substantive totals outside 60–80 rejected; reply outside 30–40 rejected
- [ ] Style/Content outside 24–32 and Strategy outside 12–16 rejected
- [ ] Non-half-mark values (e.g. 28.3) rejected
- [ ] POI modifier beyond ±2 rejected; a modifier that would push the total outside 60–80 clamps
- [ ] Low-point win blocked with an explicit message
- [ ] Draws blocked
- [ ] Reply speeches score on the halved scale
- [ ] One scoring module; no duplicated formula anywhere

**Ballot lifecycle**
- [ ] Pre-populated with correct teams, speakers, and motion — no manual name entry
- [ ] Submission blocked without a non-empty RFD
- [ ] Tab sees accurate Not Started / In Progress / Submitted per room, live
- [ ] Locked against judge edits after submit
- [ ] Coordinator correction requires a reason and records previous values
- [ ] `flagged` is a real field; no `[FLAG:]` strings in `notes`

**Panel**
- [ ] Majority resolves correctly for 1, 2, 3, and 5 judge panels
- [ ] A debate is not decided until all assigned judges submit
- [ ] Even-panel tie resolved by chair; `winning_team_id` never undefined on a completed debate
- [ ] Splits flagged for review, not averaged into invisibility

**Flowing and timer**
- [ ] Notes persist with no manual save
- [ ] Kill the tab mid-speech, reopen → flow restored exactly, attributed to the right speaker
- [ ] Notes survive a full device restart
- [ ] Timer reflects configured speaking times and survives reload

**Format**
- [ ] Non-WorldSchools formats show "Coming soon" and cannot be selected or submitted

**Devices**
- [ ] Full ballot entry works on a low-end Android phone on an intermittent connection

---

## Out of scope

- Local persistence mechanics → `03-offline.md`
- Attendance and participation scoring → `05-rankings.md`, `ranking-model.md`
- Student→judge and panel feedback flows → `07-phase2.md`
- Break calculation from ballot results → `04-pairing.md`

---

## Outstanding — raised in review, not yet built

### Auto-save on interaction, not on a button

`in_progress` is currently written only when the judge clicks **Save Draft**. It should be written on any meaningful action — a score entered, a comment typed — so Tab's Not Started / In Progress / Submitted view reflects reality and the deliverables' "no manual Save action required at any point" is actually met. Depends on `03-offline.md` for the local layer; the server side is already correct.

### Timer is decorative

`DebateTimer` is a `setInterval` counting up from zero. It does **not** read `tournament.speaking_times`, has **no audible or visual warnings** (protected time, overtime), and never persists `current_speaker` / `current_position` / `time_remaining` — those schema fields are dead. Recording works and uploads; the timer around it does not do what a judge needs. The deliverable asks for "standard time warnings" explicitly.

### Argument flow needs a UX rebuild

The flow tool works mechanically but the interaction is poor: linking a rebuttal to the argument it answers is unclear, and the relationship is not visible once recorded. This is the judge's primary live-capture tool and is meant to feed the RFD directly. Treat the current implementation as a prototype to be redesigned, not adjusted.

### Email templates are not on brand

Templates in `convex/functions/email.ts` use hardcoded colours (`#f97316` orange, `#a16207`, `#2c1810`) and carry **no logo**. They should use the platform palette and mark, defined once and shared, rather than per-template hex values. Emails sent today: tournament invitation (single and bulk), welcome, magic link, account approved, password reset, and bulk notifications.
