# 03 — Offline-First In-Tournament Operations

**Phase:** 1 · **Blocks:** `02-ballot.md` (flowing persistence), `04-pairing.md` (offline pairing)

> Venues in some regions will not have reliable internet; the app must function fully offline and sync automatically once reconnected.

Scope per user: **the whole in-tournament operation** — pairings, ballots, rankings, payments, registration. A full tournament must be runnable locally and reconcile when connectivity returns.

---

## Current state — offline does not work

Despite substantial scaffolding, there is no working offline write path.

| Claim | Evidence |
|---|---|
| **The service worker is never served** | It lives at `app/sw.js`, not `public/sw.js`. Under App Router only `public/` is served as static assets; `public/` contains just `icons/` and `images/`. `PWAManager.registerServiceWorker()` requests `/sw.js`, which almost certainly 404s in production. |
| **There is no mutation queue** | `hooks/use-offline.tsx:327-331` — `useOfflineSync()` returns a hardcoded `queueCount: 0` with the comment `// Placeholder for now`. The offline banner's "N actions queued" can never show a non-zero count. |
| **Background sync is an empty stub** | `app/sw.js:263` — `syncOfflineMutations()` only `console.log`s. Line 253: `//TODO: ... (to be implemented in Phase 3)` |
| **The sync table is unused** | `sync_logs` (`convex/schema.ts:601`) has per-device pending/conflict records and `conflict_resolution` — and **no Convex function reads or writes it**. |
| **Cache keys are derived from stack traces** | `hooks/use-offline.tsx:224-241` — `generateCacheKey()` parses `new Error().stack` for a filename and line number. Non-deterministic across builds, breaks under minification, collides between queries on the same line. |
| **Connectivity detection is invasive and unreliable** | `lib/pwa/offline-detector.tsx:456` monkey-patches `window.WebSocket`; `pingExternalServer()` (262-298) pings `httpbin.org`, `jsonplaceholder.typicode.com`, `api.github.com` with `mode: 'no-cors'` — an opaque response resolves on almost any DNS hit, and it puts third-party hosts on the critical path for a low-connectivity Rwandan deployment. |
| **Two uncoordinated IndexedDB stores** | `irank-files` (`lib/pwa/pwa-utils.ts`) and `irank-offline-cache` (`hooks/use-offline.tsx`), raw API, no shared schema or migration story. |
| **Broken push icons** | `app/sw.js:278-279` references `/icons/icon-192x192.png` and `/icons/badge-72x72.png`; actual files are `icon-192.png`, `icon-512.png`. |

The one genuinely working offline feature is the localStorage pairing draft (`tournament-pairing.tsx`, key `pairings_draft_${tournamentId}_${round}`).

### Why Convex alone is not enough

Convex queues mutations in memory and replays them on reconnect with exactly-once delivery — good, but **the queue does not survive a page reload, tab close, crash, or device restart.** That is precisely the failure the deliverables forbid:

> If the app closes, crashes, or the device restarts mid-debate, reopening the ballot restores the in-progress flow exactly where the judge left off.

Convex has no official offline persistence. Durability is ours to build.

---

## Target state

### Local store

**Dexie over IndexedDB** as the device source of truth for in-tournament data. Replaces both raw-IndexedDB stores and the stack-trace cache-key scheme.

- Explicit, versioned schema with migrations.
- Tables mirroring the entities a tournament needs offline: tournament, rounds, debates, teams, judges, ballots, flowing notes, payments, standings.
- Deterministic, explicit cache keys — never derived from stack traces.

### Durable outbox

Every mutation is written to a persisted queue **before** dispatch.

- Stable **idempotency key** per operation so replay cannot double-apply.
- Retry with backoff; failures surface to the user rather than vanishing.
- Survives reload, crash, and restart.
- Drains in order on reconnect, with visible progress.
- Populates the existing `sync_logs` table so sync state is inspectable server-side.

### Service worker

- **Move `app/sw.js` → `public/sw.js`** so it is actually served. Verify registration in production, since today it silently is not.
- Adopt **Workbox** rather than the hand-written 312-line SW.
- Precache the app shell; cache-first for static assets. Convex data flows over WebSocket, so the current `handleAPIRequest` GET caching does effectively nothing — the local store, not the SW, is what makes data available offline.
- Fix the push icon paths.

### Connectivity detection

Rewrite `lib/pwa/offline-detector.tsx`:

- Use **Convex's official connection state**; remove the `window.WebSocket` monkey-patch.
- Remove third-party pings entirely. Reachability of our own backend is the only signal that matters.
- Expose a clear three-state model: **Online / Degraded / Offline**, driving one honest status indicator.

---

## Peer sharing — QR and file transport

### Why not Bluetooth

The previous Bluetooth attempt could never have worked. **Web Bluetooth supports only *central* mode in browsers — a phone cannot advertise as a peripheral.** Phone-to-phone browser transfer is architecturally impossible. Only the `@types/web-bluetooth` devDependency remains; there is no implementation to salvage. Remove the dependency.

### Transport (user-selected)

**QR code** — `qrcode` and `jsqr` are already dependencies. Chunked/animated QR for payloads exceeding a single code, with sequence numbers and a checksum so a partial scan is detected rather than silently truncating. Best for a few ballots or one round of pairings.

**File export/import** — a signed bundle file moved by any means the OS provides (USB, OS-level Bluetooth share, WhatsApp, SD card). Handles any payload size. Note this uses the *operating system's* Bluetooth, not the browser's — which is why it works where Web Bluetooth cannot.

### Bundle format

Versioned and self-describing: schema version, origin device id, tournament id, logical clock, entity set, and an integrity checksum. A bundle for a different tournament or an incompatible version is rejected with a clear reason, never partially applied.

### Reconciliation — receiver decides

Per user: **per-item review with diff. Nothing applies until the receiver confirms.**

- Incoming changes grouped by entity (ballot, pairing, payment, registration).
- Each item shows **mine vs theirs side by side**.
- **Accept / Decline per item**, plus "accept all".
- Ordering uses timestamps and origin as *evidence presented to the receiver* — never as an automatic merge rule.
- Declining is recorded, so the same declined item is not re-proposed on every subsequent import.
- The result is applied through the same outbox, so an accepted change syncs onward normally.

Motivating case from the user: a judge with connectivity can hand their version to a coordinator without it, who reviews and accepts selectively.

---

## Acceptance criteria

**Durability**
- [ ] Kill the tab mid-ballot → reopen → in-progress ballot and flowing notes restored exactly
- [ ] Full device restart mid-round → state restored
- [ ] Mutations queued offline survive reload and drain on reconnect
- [ ] Replaying the queue twice does not double-apply (idempotency)

**Full offline tournament**
- [ ] In airplane mode: generate pairings, run a round, submit ballots, view standings, record a payment, register a team
- [ ] Reconnect → everything syncs with no duplicates and no lost writes
- [ ] Queue depth and sync progress are visible and accurate (never a hardcoded 0)

**Service worker**
- [ ] `public/sw.js` is served and registers in production — verified, not assumed
- [ ] App shell loads with no network
- [ ] Push notifications render with correct icons

**Peer transfer**
- [ ] Export a round of ballots from device A via QR; import on device B
- [ ] Same via file export/import
- [ ] Partial/corrupt QR scan detected and rejected, not silently truncated
- [ ] Bundle from a different tournament rejected
- [ ] Review screen shows mine vs theirs per item; declining leaves local state untouched; accepting applies only accepted items
- [ ] Accepted items sync onward to Convex correctly

**Hygiene**
- [ ] No stack-trace-derived cache keys remain
- [ ] No `window.WebSocket` monkey-patch
- [ ] No third-party connectivity pings
- [ ] `@types/web-bluetooth` removed

---

## Out of scope

- Deterministic pairing so offline draws can be server-verified → `04-pairing.md`
- Ballot schema and scoring → `02-ballot.md`
- Sync status animations → `06b-motion.md`
