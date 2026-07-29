# Dependency advisories — July 2026

Snapshot of `npm audit` at the time of the bump commit, and what was actually done.

> **Correction, 29 Jul 2026.** The `overrides` block below shipped but did **not** take
> effect. `npm install` reported "up to date" and never rebuilt the ideal tree, so npm
> never processed the overrides at all — `package-lock.json` has no `overrides` key in its
> root entry. `brace-expansion`, `fast-uri` and `valibot` moved anyway as a side effect of
> the prisma bump; **`postcss` (8.5.16) and `sharp` (0.34.5) did not move and are still
> vulnerable.** `npm ci --dry-run` passed throughout, because it validates dependency
> ranges and does not verify that overrides were applied — so the parity gate was green
> while the overrides were inert. Fixed by forcing a full re-resolution (delete
> `node_modules` and `package-lock.json`, then `npm install`) and gating on the resulting
> versions rather than on the exit code.

## Fixed by this commit

| Package | Was | Now | How | Severity |
|---|---|---|---|---|
| `prisma` / `@prisma/client` | 7.8.0 | ^7.9.1 | direct bump in `packages/db` | moderate |
| `postcss` | 8.5.16 | ^8.5.24 | root `overrides` | high (XSS, path traversal, arbitrary `.map` read) |
| `brace-expansion` | 5.0.7 | ^5.0.8 | root `overrides` | high (DoS / OOM) |
| `sharp` | 0.34.5 | ^0.35.3 | root `overrides` | high (inherited libvips CVEs) |
| `fast-uri` | 3.1.3 | ^3.1.4 | root `overrides` | high (host confusion) |
| `@hono/node-server` | ≤2.0.4 | ^2.0.5 | root `overrides` | moderate (path traversal, middleware bypass) |
| `valibot` | ≤1.4.1 | ^1.4.2 | root `overrides` | moderate |

`overrides` rather than plain bumps because these are transitive and their parents pin
older ranges — `npm update` will not move them.

## NOT fixed: Next.js

**There is no released fix.** The advisory range is `9.3.4-canary.0 - 16.3.0-preview.7`
and the latest published version is **16.2.12**, which is inside it. `npm audit` reporting
`fixAvailable: true` is misleading here: it means something in the graph can move, not
that a patched release exists. The fix lands in 16.3.0 stable.

Nine advisories, of which two are worth tracking for this application specifically,
because the entire operations UI is built on Server Actions and the database holds
household financial data:

- *Unauthenticated disclosure of internal Server Function endpoints*
- *Unbounded Server Action payload in Edge runtime*

Mitigating factors here: the deployment is single-user and auth-gated, there is no
multi-tenant cache, no attacker-controlled rewrite destinations, and the image
optimisation API is not publicly exposed. That is most of the risk, but "an attacker
must first get past auth" is a weaker guarantee than "the bug is not present."

**Action:** bump to `next@16.3.x` as soon as it is published, as its own commit.

## Why this is its own commit

A dependency bump that breaks the build should be trivially identifiable and revertible.
Folding it into feature work makes a Railway build failure ambiguous.

---

# Native platform binaries (separate problem, same blast radius)

`package-lock.json` is generated on Linux, so it records only the linux variant of every
platform-gated native package. npm will not add the win32 sibling when installing on
Windows — it prunes non-matching optional deps as it writes the tree (npm/cli#4828) — and
`npm ci` installs strictly from the lockfile, so it never adds one either.

The same root cause surfaced three times looking like three unrelated bugs:

| Missing package | Symptom |
|---|---|
| `@rolldown/binding-win32-x64-msvc` | **all 11** vitest suites fail at once, including untouched packages |
| `@next/swc-win32-x64-msvc` | `next build` tries to self-patch the lockfile → `ENOWORKSPACES` → falls back to pnpm → dies |
| `@parcel/watcher-win32-x64` | `next.config.ts` won't load, killing **both** `next build` and `next dev` |

**Diagnostic tell:** if *every* workspace fails, including ones the change never touched,
suspect the install tree, not the code. Real code breakage is localised.

## Fix

`scripts/ensure-platform-binaries.mjs`, wired to `postinstall`. It derives each version
from the parent that is actually installed (so nothing drifts), installs only what is
missing with `--no-save` (so the lockfile stays byte-identical to what Railway validates
with `npm ci`), and **always exits 0** — a helper must never be the reason an install fails.

Linux is listed in the matrix deliberately. Whichever platform the lockfile was last
generated on is the complete one; every *other* platform is broken. Today that is Windows,
but regenerating the lockfile on Windows would invert the problem and break Railway. The
helper heals in both directions, so it stays correct regardless of who regenerates next.

Declaring these as `optionalDependencies` does **not** work: the prune happens when the
lockfile is written, so the win32 entry is dropped again on the next Linux regeneration.
