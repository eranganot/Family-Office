# Dependency advisories — July 2026

Snapshot of `npm audit` at the time of the bump commit, and what was actually done.

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
