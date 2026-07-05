# WealthOS

A self-hosted Household Wealth Strategy Operating System — the internal software of a family
office: map, verify, strategize, monitor. Strategy-level decision support only; never product or
security recommendations, never trade execution.

- Design package: [`docs/architecture/`](docs/architecture/00-README.md)
- Monorepo: npm workspaces + Turborepo. TypeScript end-to-end (Next.js, tRPC, Prisma/PostgreSQL).
- Bilingual he (RTL) / en from day one.
- Four-phase state machine: MAPPING → VERIFICATION → STRATEGY → MONITORING, enforced at the API.

## Repository discipline

This repository is public. It must never contain household data: no real documents, no real
balances, no institution statements. All ingestion fixtures are synthetic.
