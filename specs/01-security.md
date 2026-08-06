# 01 — Security Hotfix

**Phase:** 1 · **Priority:** Immediate — these are live exposures in production.

## Deliverable

> Role-based permissions already built into the system are correctly enforced for every existing role. Confirm each role can see and do only what it should, and check for any role that can currently access another role's screens.

> Every role (School, Coordinator, Regional Coordinator, Finance, Representative, Judge) can access only its own permitted data and actions — **verified by testing, not assumed**.

---

## Issue 1 — The `"shared"` token bypasses all authentication

### Current state

`convex/functions/admin/analytics.ts` guards five queries with:

```ts
if (args.token !== "shared") {
  const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, { token: args.token });
  if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
    throw new Error("Admin access required");
  }
}
```

Present at lines **27, 132, 281, 448, 696** — `getDashboardOverview`, `getTournamentAnalytics`, `getUserAnalytics`, `getFinancialAnalytics`, `getPerformanceAnalytics`.

`"shared"` is a magic string any caller can supply. These are **public** Convex queries, so from a browser console:

```js
convex.query(api.functions.admin.analytics.getFinancialAnalytics, { token: "shared" })
```

returns full league revenue, payment distribution, per-tournament revenue, outstanding payments, and regional revenue — with no session, no report, no expiry, no view limit.

The intent was to let `analytics.ts::getSharedReportData` reuse these after validating a real `report_shares` token (`convex/functions/analytics.ts:21-45`, which does correctly check existence, expiry, and view count). The mistake is enforcing that intent with a shared secret that is neither shared nor secret.

### Target state

The bypass is **unreachable**, not merely guarded.

### Design

- Extract each query's body into an `internalQuery` (`getDashboardOverviewInternal`, etc.) taking only its data arguments — **no token**. Internal functions are not callable from any client.
- Public `query` wrappers keep their **existing names and argument shapes** so no frontend change is needed (`app/(main)/admin/analytics/page.tsx:448-503` passes a real session token already). Each verifies session + `role === "admin"`, then delegates.
- `getSharedReportData` remains the single public entry point for unauthenticated access. After validating the `report_shares` token it calls the internal queries directly, scoped to that report's `config.sections`.

One adjacent issue remains open:

- **`report_shares.report_id` holds a `JSON.parse`d config blob** (`analytics.ts:47`) in a field named as if it were an id. Replace with a typed `config` object in the schema. Deferred — it requires a data migration and is not a security defect.

**Correction to an earlier assessment:** view counting was reported as broken. It is not. `incrementViewCount` exists (`admin/analytics.ts:1080`) and is correctly invoked by `app/reports/[token]/page.tsx:284`, guarded by a ref so it fires once per view. No fix needed.

### Acceptance criteria

- [ ] `getFinancialAnalytics({ token: "shared" })` throws. Asserted by test.
- [ ] Same for the other four queries.
- [ ] No `internalQuery` in `admin/analytics.ts` is reachable from a client.
- [ ] A valid, unexpired, under-limit report token still renders `/reports/[token]` with identical content to today.
- [ ] An expired token is rejected.
- [ ] A token past `allowed_views` is rejected, and `view_count` actually increments per view.
- [ ] The admin analytics page is functionally unchanged.

---

## Issue 2 — `updateRecording` has no authentication

### Current state

`convex/functions/ballots.ts:195` — takes no token and patches `recording`, `recording_duration`, and `transcript` on **any** debate id. Any caller can overwrite any debate's recording and transcript.

### Target state

Authenticated, authorized, audited.

### Design

Add `token`; verify the session; permit only a judge assigned to that debate or an admin. Reject once the debate's ballots are locked, consistent with the ballot audit rules in `02-ballot.md`. Write an `audit_logs` entry.

### Acceptance criteria

- [ ] Unauthenticated call throws.
- [ ] A judge not assigned to the debate is rejected.
- [ ] An assigned judge and an admin both succeed.
- [ ] Every successful call writes an audit entry.

---

## Issue 3 — Gemini API key is exposed in the browser bundle

### Current state

`hooks/use-gemini.tsx:104-105`:

```ts
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
```

Two problems:

1. `NEXT_PUBLIC_*` is inlined into client JavaScript at build time. The key is extractable by anyone loading the site, and billable against your account.
2. **`gemini-2.0-flash-lite` was shut down by Google on 1 June 2026.** This feature is already broken in production, not merely deprecated.

### Target state

Key server-side only; model current.

### Design

Move inference into a Convex action reading `GEMINI_API_KEY` from the Convex environment. `hooks/use-gemini.tsx` calls the action rather than the SDK. Migrate to **`gemini-2.5-flash-lite`** — same list price as the retired model ($0.10 input / $0.40 output per 1M tokens), 8× output-token limit, currently the cheapest model Google offers.

Rotate the exposed key as part of this change; it must be treated as compromised.

### Acceptance criteria

- [ ] No `NEXT_PUBLIC_GEMINI_API_KEY` anywhere in the repo.
- [ ] Production bundle contains no Gemini key. Asserted by grepping build output.
- [ ] AI features work end-to-end on `gemini-2.5-flash-lite`.
- [ ] The old key is rotated.
- [ ] Action failures surface a clear user-facing error rather than failing silently.

---

## Issue 4 — Authorization is copy-pasted, not centralized

### Current state

No `middleware.ts`. Every protected function hand-writes `ctx.runQuery(internal.functions.auth.verifySessionReadOnly, ...)` followed by its own role comparison — the pattern appears across **28 files**, with **62 literal `role !== "admin"` comparisons**.

Client-side `useRequireAuth` (`hooks/use-auth.tsx:617-628`) only redirects; it is cosmetic and enforces nothing.

Risk: a single omitted check in ~150 call sites is an unguarded endpoint, and with no tests, no middleware, and no shared helper, nothing catches it. Issues 1 and 2 are instances of exactly this.

### Target state

**Phase 1:** every function audited and provably guarded.
**Phase 2:** checks centralized into shared helpers (deferred per user decision).

### Design

Phase 1 is an audit, not a refactor — the refactor is `07-phase2.md`.

Enumerate every exported `query`, `mutation`, and `action` in `convex/`. For each, record the required role(s) and whether a check exists. Write a test that reflects over the generated API and asserts every public function rejects an invalid token. Fix every gap found.

### Acceptance criteria

- [ ] An inventory table of all public Convex functions and their required roles exists in this spec.
- [ ] Every public function rejects an unauthenticated call. Asserted by a single reflective test.
- [ ] Cross-role tests: a student token cannot reach admin/school/volunteer data; a school admin cannot reach another school's data.
- [ ] Any newly added public function without an auth check fails CI.

---

---

## Issue 5 — Vulnerable dependencies

Surfaced by `npm audit` on first install (dependencies were not previously installed locally; there is no committed lockfile — see `00-foundations.md`).

**5 vulnerabilities: 1 critical, 4 high.**

| Package | Severity | Notes |
|---|---|---|
| `jspdf` ≤4.2.0 | **Critical** | Local File Inclusion / path traversal, PDF injection allowing arbitrary JavaScript execution, multiple DoS vectors. Used for report/certificate export. |
| `next` 15.4.8 | High | Many advisories, including middleware/proxy bypass, cache poisoning, XSS with CSP nonces, and SSRF. npm marks this exact version deprecated for a security vulnerability. |
| `xlsx` | High | Used for data export/import. |
| `postcss` | High | Build-time. |
| `sharp` | High | Inherited libvips CVEs (CVE-2026-33327/33328/35590/35591). |

Relevance to this app specifically:

- **`jspdf` is the critical one.** It generates reports and certificates from user-influenced data (school names, student names, tournament titles). PDF injection and path traversal are directly reachable.
- **Next.js middleware-bypass advisories matter less than usual here** — the app has no `middleware.ts` — but the cache-poisoning, XSS, and SSRF items still apply.

### Design

Upgrade `next` within the 15.x line to a patched release first, since it is the smallest change with the widest coverage; a jump to 16.x is a separate, larger piece of work and should not ride along with a security fix. Then upgrade `jspdf`, `xlsx`, `postcss`, and `sharp`, verifying export and certificate generation after each.

**Do not run `npm audit fix --force`** — it pulls breaking major versions indiscriminately. Upgrade deliberately, one package at a time, with the export paths exercised after each.

This is blocked on `00-foundations.md`: upgrading dependencies without tests or CI is how a security fix becomes an outage. Commit the lockfile first so upgrades are reproducible.

### Acceptance criteria

- [ ] `npm audit` reports no critical or high vulnerabilities
- [ ] A lockfile is committed so audits are reproducible
- [ ] PDF export and certificate generation verified after the `jspdf` upgrade
- [ ] Excel export/import verified after the `xlsx` upgrade
- [ ] The app builds and the full test suite passes after each upgrade
- [ ] CI fails on new critical/high advisories

---

## Rate limiting on unauthenticated endpoints

### Problem

Every endpoint an anonymous caller can reach was unbounded. `generateMagicLink`
sends mail, so a loop from a browser console meant unbounded outbound mail
against the SMTP quota. `signIn` runs a password hash, so a loop meant
unbounded password guessing. The Gemini actions are billed per call.

The account lockout in `signIn` counts failures per user, but only after the
lookup and hashing work, and only for addresses that exist.

### Design

The `@convex-dev/rate-limiter` component, with limits defined in
`convex/lib/limits.ts`. Keyed per email, phone, or user wherever possible so
one person hammering an endpoint cannot lock everybody else out; global limits
sit alongside as a backstop against a distributed attempt, set well above real
use.

**The rollback problem.** The component is transactional: if a mutation throws,
its rate limit consumption rolls back with everything else. Counting inside
`signIn` would therefore limit only *successful* sign-ins, which is exactly
backwards. The count lives in its own mutation — `recordSignInAttempt`,
`recordPasswordResetAttempt` — that the client calls first and that commits
independently of the outcome.

**Unverifiable tokens cannot be the key.** `recordPasswordResetAttempt` keys on
the user id when the token verifies. When it does not, the caller chose the
token, so keying on it would hand every guess a fresh budget. Those attempts
share one global bucket instead.

Magic links need no separate counter: they deliberately succeed for registered
and unregistered addresses alike, so the mutation commits either way.

### Acceptance criteria

- [x] Magic link requests are limited per address and globally
- [x] Forgot-password is covered (it is the same mutation as magic link)
- [x] Sign-in is limited per email and per phone, and the count survives a
      failed sign-in
- [x] Password reset token guessing is limited, including for tokens that do
      not verify
- [x] Sign-up is limited globally
- [x] Gemini actions are limited per user and globally
- [x] Refusals say when to try again, in units a person can act on
- [x] One address being limited does not block another

---

## Account enumeration and the first administrator

### Problem

`generateMagicLink` answered "No account was found with the provided details."
for an unregistered address and succeeded for a registered one. That is an
oracle: a script can test a list of addresses and learn which have accounts,
which is exactly what a credential-stuffing run wants before it starts.

It also returned the magic link token in the mutation result, putting a
credential in the browser's network tab and anywhere in between.

Separately, `signUp` accepted `role: "admin"` from the client with no guard, so
anyone could create an administrator from a browser console. Closing that left
a fresh deployment with no way in at all.

### Design

`generateMagicLink` returns the same message and the same shape for every
address, and creates a link only when the address is registered. Rate limits
run *before* the user lookup, so response timing does not leak registration
either. The token is never returned; the email is sent server-side.

`signUp` refuses `role: "admin"` once any administrator exists.

`functions/bootstrap:createFirstAdmin` is an `internalMutation`, unreachable
from a browser and runnable only from a terminal with deploy credentials. It
refuses once any administrator exists, so it cannot be used later to quietly
grant access.

### Acceptance criteria

- [x] An unregistered address gets the same answer as a registered one
- [x] The magic link token is never returned to the caller
- [x] A link is created for a registered address and not for an unregistered one
- [x] `signUp` refuses to create an administrator once one exists
- [x] The first administrator can be created only with deploy credentials, and
      only once

---

## Out of scope

- Centralizing auth helpers → `07-phase2.md`
- Ballot lock and edit-audit semantics → `02-ballot.md`
- Payment data authorization → `05b-finance.md`
- Next.js 16 migration — a feature upgrade, not a security fix
