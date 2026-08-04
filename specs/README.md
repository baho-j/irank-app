# iRank Specs

One spec per unit of work. Every spec traces to a checkbox in `iDebate_Rwanda_League_System_Deliverables.pdf` so "done" is never a judgement call.

## How to read a spec

Each spec has the same shape:

- **Deliverable** — the exact checkbox(es) it satisfies, quoted.
- **Current state** — what the code does today, with file:line evidence. No claims without evidence.
- **Target state** — what it must do.
- **Design** — how, including the decisions already taken and why.
- **Acceptance criteria** — checkable assertions. These become tests.
- **Out of scope** — what this spec deliberately does not cover, and which spec owns it.

## Status vocabulary

Tracked in `../BACKLOG.md`:

| Status | Meaning |
|---|---|
| Not Started | No code written |
| In Progress | Being worked on |
| Blocked | Waiting on a decision or another spec |
| Done | Implemented and unit/integration tested |
| **Verified** | Demonstrated live against **real (not demo) data** to the League Coordinator — the contract's acceptance standard |

`Done` is not `Verified`. The contract closes only on `Verified`.

## Index

| Spec | Phase | Owns |
|---|---|---|
| `00-foundations.md` | 1 | Testing, CI, env contract, lockfile |
| `01-security.md` | 1 | `"shared"` bypass, `updateRecording`, Gemini key, auth sweep |
| `01b-email.md` | 1 | SMTP migration off Resend |
| `02-ballot.md` | 1 | WSDC scoring, RFD, panel reconciliation, flowing, timer |
| `03-offline.md` | 1 | Local store, durable outbox, service worker, QR/file transport |
| `04-pairing.md` | 1 | Isomorphic pairing, cost model, breaks, brackets, judge conflicts |
| `05-rankings.md` | 1 | Release gate, ranking layers, school tiers, query performance |
| `05b-finance.md` | 1 | Payment tracking, waiver codes |
| `06-mobile.md` | 1 | Responsive audit, card-row pattern |
| `06b-motion.md` | 1 | Animation layer, confetti, reduced-motion |
| `07-phase2.md` | 2 | Ten-stage workflow, League Manager Dashboard, feedback |
| `08-docs.md` | 2/3 | Docs site rebuild, per-role manuals |
| `ranking-model.md` | 1 | **Weights — awaiting sign-off before implementation** |

## Ground rules

These hold across every spec; see `../CLAUDE.md`.

1. WSDC scoring constants come from the rulebook. They are not tunable.
2. Attendance and school criteria live in league-wide rankings only — never on a ballot, never in in-tournament standings.
3. Offline is a first-class requirement for all in-tournament operations.
4. The client is never the authority. Anything computed offline is re-verified on sync.
5. Nothing is Done without a test.
