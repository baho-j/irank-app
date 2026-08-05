# 01b — Email Transport: Off Resend

**Phase:** 1 · **Reason:** Resend rate limits are being hit in production.

## Deliverable

> Any existing automated email/SMS notifications are tested for **actual delivery — not just a "sent" status in the logs**.

---

## Current state

`convex/functions/email.ts` — 1,057 lines, Resend-backed (`resend@^4.5.1`). Sends invitations (single and bulk), welcome, magic link, account-approved, password reset, and bulk notifications.

Bulk invitations are the pressure point: a league-wide send exceeds Resend's limits.

## Target state

A provider-agnostic email module, off Resend, with delivery verified against real inboxes.

## Design

### The open question: does SMTP work on Convex?

Convex supports a Node runtime via `"use node"` (Node 20/22/24, 512MB, 10-minute action timeout, actions only — not queries or mutations). Nodemailer *should* work there.

**But the Convex documentation only explicitly guarantees outbound `fetch`.** It does not confirm raw TCP socket support, which SMTP requires on ports 465/587. Convex's own docs recommend asking on Discord when a library's compatibility is unclear.

**This must not be assumed.** The plan is sequenced so we find out before committing.

### Step 1 — Spike

A throwaway `"use node"` action that sends a single message via Nodemailer against the real SMTP host. Timeboxed. The only question: do outbound SMTP sockets open from a Convex action?

### Spike result — SMTP works

**Answered.** Nodemailer connects and authenticates against `smtp.gmail.com:587` with STARTTLS. `transporter.verify()` succeeds, so Convex's Node runtime does permit outbound SMTP sockets and the HTTP-API fallback below is not needed.

### Step 2a — Chosen path

`email.ts` runs under `"use node"` and sends through `convex/lib/mailer.ts`:

- Pooled transport (`maxConnections: 5`, `maxMessages: 100`) for bulk sends
- `secure` is derived from the port, since 465 is implicit TLS and 587 upgrades via STARTTLS
- Per-message result returned, never fire-and-forget

**Retry** uses the official `@convex-dev/action-retrier` component rather than a hand-rolled loop. `convex/lib/retrier.ts` configures it (1s initial backoff, base 2, 4 attempts) and public send actions enqueue the internal `deliver` action through `retrier.run`. `deliver` throws on failure because a thrown error is the retrier's retry signal.

Consequence worth noting: public send actions now return a `runId` and report the message as **queued**, not sent. Delivery happens asynchronously with retries. Callers that need confirmed delivery must query the run status rather than trusting the immediate return.

### Step 2b — If sockets had been blocked

Would have used an HTTP-API provider callable with plain `fetch` (Brevo, Mailgun, SES) behind the same interface. Not needed.

### Provider interface

One `EmailProvider` abstraction with `send(message)` and `sendBulk(messages)`. Call sites depend on the interface, never the SDK. Switching providers becomes an adapter swap, not a 1,057-line rewrite — which is the real lesson from being stuck on Resend.

### Delivery accounting

The deliverable requires proof of *delivery*, not a queued status:

- Record per-message provider response and message id.
- Handle bounces and failures where the provider reports them.
- Surface failures to admins rather than logging silently.
- Bulk sends report per-recipient outcomes, not a single aggregate success.

## Acceptance criteria

- [ ] Spike conclusively answers whether SMTP works from a Convex action; result recorded here
- [ ] No `resend` dependency remains
- [ ] All existing email types send correctly on the new transport
- [ ] **Delivery confirmed to real inboxes** across at least two providers (Gmail + one other), including spam-folder placement
- [ ] A bulk send at realistic league size completes without hitting limits
- [ ] Transient failures retry; permanent failures surface to an admin
- [ ] Bulk sends report per-recipient outcomes
- [ ] Provider swap requires changing only an adapter
- [ ] Credentials are Convex environment variables, never `NEXT_PUBLIC_*`

## Out of scope

- SMS (none currently implemented; the deliverable says "any existing")
- Notification content and templates — unchanged by this spec
