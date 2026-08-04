# 05b — Finance: Payment Tracking

**Phase:** 1 · **Scope narrowed per user:** Phase 1 is *payment tracking*. Grant release, itemized accountability, and finance queues belong to the ten-stage workflow in `07-phase2.md`.

## What Phase 1 covers

Per the user: tracking **which schools have paid for their teams**, and letting a student confirm payment.

## Current state

There is **no finance route and no finance UI**. Payments appear only as:

- A section inside `app/(main)/admin/analytics/page.tsx`
- Fields in the team management dialogs (`team-management-dialog.tsx`, `tournament-teams.tsx`, `tournament-pairing.tsx`)

Backend:

| Function | File | Purpose |
|---|---|---|
| `createPayment` | `admin/teams.ts:609` | The **only** `insert("payments")` in the codebase |
| `getTournamentPayments` | `admin/teams.ts:680` | List |
| `generateWaiverCode` | `admin/teams.ts:415` | |
| `getTournamentWaiverCodes` | `admin/teams.ts:493` | |
| `validateWaiverCode` / `useWaiverCode` | `admin/teams.ts:529` / `563` | internal |

Data model:

- `teams.payment_status`: `pending` | `paid` | `waived`
- `payments`: tournament, school, amount, currency (RWF/USD), status, method (bank_transfer/mobile_money/cash/other), reference number, receipt image, notes, created_by
- `tournaments.waiver_codes[]` embedded on the tournament document
- `tournaments.fee` + `fee_currency`

**There is no invoice table and no invoice number.** Every payment is hand-entered by an admin; there is no gateway integration. That is acceptable for Phase 1 — it matches how the league actually operates — but it should be stated rather than implied.

### Known defects

- `getFinancialAnalytics` scans all `payments` and filters in JS (`admin/analytics.ts:464-468`) instead of using the `by_created_at` index.
- Financial analytics are readable without authentication via the `"shared"` token bypass → fixed in `01-security.md`.
- `waiver_codes` embedded in the tournament document will contend on concurrent redemption; a separate table is the correct shape if usage grows.
- No duplicate-submission protection — a double-tap or slow connection can create duplicate payment rows. The deliverables require this explicitly.

## Target state

- Admin/school records which schools have paid for their teams, moving `payment_status` between `pending` / `paid` / `waived`.
- Student-side payment confirmation.
- Payment history visible per tournament and per school, agreeing exactly with what admins see.
- Works offline like every other in-tournament operation (`03-offline.md`) — payments recorded at a venue with no connectivity sync later.

## Acceptance criteria

- [ ] Admin can mark a school's teams paid, pending, or waived; the change is reflected everywhere immediately
- [ ] A student can confirm payment; the confirmation is attributable and audited
- [ ] Waiver codes validate, apply, respect usage limits and expiry, and cannot be redeemed beyond their limit under concurrent use
- [ ] **Duplicate-submission protection**: double-tap or retry cannot create duplicate payment rows
- [ ] School-visible payment data matches admin-visible data exactly
- [ ] A school cannot see another school's payment data — asserted by test
- [ ] Payments recorded offline sync correctly with no duplication
- [ ] Financial queries use indexes; no full scans
- [ ] Every payment mutation writes an audit entry

## Out of scope — all `07-phase2.md`

- Grant release queue (50,000 RWF Club / 100,000 RWF SLD)
- Itemized financial accountability review
- Grants Approved / Released / Outstanding dashboard totals
- Risk/eligibility flagging on school profiles
