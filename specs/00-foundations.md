# 00 — Foundations

**Phase:** 1 · **Blocks:** everything. Nothing else can be called Done without this.

## Why this is first

The contract's acceptance standard is that each item is *demonstrated live against real data*. Today there is no way to demonstrate anything repeatably:

- **Zero test infrastructure.** No vitest/jest/playwright config, no `__tests__`, no `*.test.ts`, no `convex-test`. A search for any path matching `test|spec|e2e|mock` returns empty. There is no `test` script.
- **No CI.** No `.github/` at all — nothing runs on push or PR.
- **No lockfile.** `.gitignore:39` ignores `package-lock.json`, a leftover from the Convex template. Dependency versions are unpinned for CI and fresh clones — unacceptable for a project being handed over.
- **Lint does not gate builds.** `next.config.mjs` sets `eslint: { ignoreDuringBuilds: true }`, and `.eslintrc.json` disables `@typescript-eslint/no-explicit-any`.
- **No documented env contract.** No `.env.example`. Required variables are only discoverable by reading source.
- **Hardcoded deployment host.** `next.config.mjs` whitelists `wonderful-oyster-582.convex.cloud` literally rather than deriving it from env.
- `.prettierrc` exists but is empty (`{}`).

## Target state

### Testing

| Layer | Tool | Covers |
|---|---|---|
| Convex functions | Vitest + `convex-test` | Auth, ballots, pairing, rankings, payments |
| Pure logic | Vitest | `lib/scoring/`, `lib/pairing/` — no framework needed, by design |
| Components | Vitest + React Testing Library | Ballot form, reconciliation review |
| E2E | Playwright | Tournament-day flow, offline scenarios, 360px mobile |

Property-based testing (fast-check) for the pairing invariants in `04-pairing.md`, where example-based tests cannot cover the input space.

Fixtures for realistic tournaments at 6–8, 24–32, and 64+ teams, reused across pairing, rankings, and break tests.

### CI

`.github/workflows/ci.yml` on every PR: install from lockfile → typecheck → lint → test → build. All must pass.

A dedicated job asserts every public Convex function performs authorization (`01-security.md`), so a new unguarded endpoint fails CI rather than reaching production.

### Scripts

Add `test`, `test:watch`, `test:e2e`, `typecheck`, `format`. Currently only `dev`, `build`, `start`, `lint` exist.

### Configuration hygiene

- Commit `package-lock.json`; remove the `.gitignore` entry.
- Write `.env.example` covering `NEXT_PUBLIC_CONVEX_URL`, the email transport variables (`01b-email.md`), `GEMINI_API_KEY` (server-side, per `01-security.md`), and VAPID keys.
- Derive the Convex image host from env.
- Remove `ignoreDuringBuilds` once lint is clean; re-enable `no-explicit-any` and fix fallout, or scope the exception narrowly rather than globally.
- Fill in `.prettierrc`.

## Acceptance criteria

- [ ] `npm test` runs and passes
- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run lint` passes with `ignoreDuringBuilds` removed
- [ ] CI runs on PR and blocks merge on failure
- [ ] A fresh clone installs deterministically from the lockfile
- [ ] `.env.example` lists every required variable; a missing one fails fast with a clear message rather than at runtime
- [ ] No deployment host hardcoded in source
- [ ] Adding a public Convex function without an auth check fails CI
- [ ] Tournament fixtures exist at all three scales and are shared across suites

## Out of scope

- What the tests assert — owned by each feature spec
