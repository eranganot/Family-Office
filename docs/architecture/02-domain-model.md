# 02 — Canonical Domain Model (DDD Mapping)

The household is modeled as a **graph of interconnected entities**, not a collection of accounts.
Income → Cash Flow → Assets → Taxes → Retirement → Estate; Mortgages → Liquidity; Goals →
Allocation Strategy. Engines operate on the whole graph.

## 1. Bounded contexts

| Context | Responsibility | Key aggregates |
|---|---|---|
| Household Core | Identity, members, workflow state machine | Household |
| Ledger | All financial facts: assets, liabilities, accounts, cash flow, insurance | LedgerItem |
| Ingestion | Documents, adapters, raw payloads, suspense routing, provenance | ImportBatch |
| Verification | Confidence, completeness, staleness, human sign-off | VerificationReport (computed) |
| Registry | Versioned tax matrices + configurable assumptions | TaxRuleSet, Assumption |
| Goals | Goal definitions, dependencies, funding requirements | Goal |
| Strategy | Recommendation generation, prioritization, explainability, data-quality gating | Recommendation |
| Scenario | What-if projections and comparisons | Scenario |
| Journal | Decision journal, snapshots, drift monitoring | DecisionJournalEntry, HouseholdSnapshot |

Shared kernel: value objects below + `RawDataPayload` / `CanonicalLedgerItem` contracts.

## 2. Entity matrix

| Entity | Context | Identity | Key attributes | Lifecycle | Core invariants |
|---|---|---|---|---|---|
| Household | Core | uuid | name, baseCurrency, workflowState, locale | Created once | Only legal state transitions (see state machine); single row in v1 |
| FamilyMember | Core | uuid | name, role (ADULT/CHILD), birthDate, taxResidency, employmentStatus | Add/archive | Ownership shares must reference existing members |
| LedgerItem | Ledger | uuid | kind, category, name, currency, status, confidence, lastConfirmedAt | Active → Closed (never deleted) | Exactly one detail record matching `kind`; SUSPENSE items carry no detail |
| OwnershipShare | Ledger | (ledgerItem, member) | sharePct | With parent | Shares per item sum to 100% |
| Valuation | Ledger | uuid | asOf, value, currency, source, confidence | **Append-only** | Never updated; corrections append a superseding row |
| AccountDetail | Ledger | ledgerItemId | institution, accountType, trackType, feePct, numberMasked | With parent | accountType from Israeli-aware enum (pension, gemel, hishtalmut…) |
| RealEstateDetail | Ledger | ledgerItemId | address, propertyType, purchaseDate/Price, isPrimaryResidence | With parent | — |
| MortgageDetail | Ledger | ledgerItemId | lender, linkedProperty | With parent | Sum of track principals = mortgage principal |
| MortgageTrack | Ledger | uuid | trackType (PRIME/FIXED_LINKED/FIXED_UNLINKED/VAR_LINKED/VAR_UNLINKED), principal, rate, cpiLinked, endDate | With mortgage | Israeli multi-track structure is first-class |
| CashFlowDetail | Ledger | ledgerItemId | flowType, amount, frequency, startDate, endDate | With parent | endDate ≥ startDate |
| InsuranceDetail | Ledger | ledgerItemId | policyType, coverageAmount, premium, throughPension | With parent | — |
| Document | Ingestion | uuid | sha256, filename, mime, institution, docType, parseStatus | Immutable | File bytes never modified; duplicate sha256 rejected |
| ImportBatch | Ingestion | uuid | adapterId, adapterVersion, status, startedAt | Runs to terminal state | Batch records adapter version for reproducibility |
| ImportedField | Ingestion | uuid | fieldPath, originalValue, originalCurrency, importDate, confidence, verificationStatus | Append per import | Every ingested field has provenance — no orphan values |
| SuspenseItem | Ingestion | uuid | rawData, reason, status | PENDING → RESOLVED | Raw data preserved verbatim; resolution links a LedgerItem; never auto-classified |
| TaxRuleSet | Registry | (country, taxYear, ruleType, version) | payload matrix, source, publishedAt | Versioned, immutable | Calculations must request rules by year; no hardcoded rates anywhere |
| Assumption | Registry | (key, version) | value, unit, description, source, effectiveFrom | Versioned, immutable | New value = new version; dependents invalidated |
| Goal | Goals | uuid | type, priority, targetDate, requiredFunding, riskTolerance, status | Active → Achieved/Abandoned | Dependency graph acyclic |
| Recommendation | Strategy | uuid | type, title, rationale (structured), confidenceScore, dataCompletenessScore, priorityScore, status, engineVersion, snapshotId | PROPOSED → ACCEPTED/REJECTED → IMPLEMENTED/SUPERSEDED/INVALIDATED | Must reference ≥1 goal, ≥1 assumption version, evidence; strategy-level only — product/security references are rejected by validation |
| DecisionJournalEntry | Journal | uuid | decision, decidedAt, implementationDate, expectedOutcome, actualOutcome | Append-only | Every recommendation decision is journaled |
| Scenario | Scenario | uuid | name, type, parameterOverrides, resultSnapshot | Recomputable | Overrides reference assumption keys only |
| HouseholdSnapshot | Journal | uuid | takenAt, kind, payload, schemaVersion | **Append-only** | Snapshot precedes every strategy run |
| WorkflowTransition | Core | uuid | fromState, toState, reason, at | Append-only | Must match legal transition table |
| AuditEvent | Cross | uuid | actor, eventType, entity, entityId, payload, at | Append-only | Written for every mutation |
| User | Core | uuid | email, passwordHash | Single row v1 | Shared household login |

## 3. Value Object matrix

| Value Object | Shape | Rules |
|---|---|---|
| Money | { amount: Decimal, currency: CurrencyCode } | No arithmetic across currencies without an explicit FxConversion; banker's rounding at boundaries only |
| CurrencyCode | ISO-4217 subset: ILS, USD, EUR (extensible) | Closed enum per registry version |
| FxConversion | { from, to, rate, asOf, source } | Rate provenance mandatory |
| Percentage | Decimal 0–100 (or 0–1 internally, one convention) | Validation at construction |
| ConfidenceScore | int 0–100 | 0 = unverified guess, 100 = human-verified |
| CompletenessScore | int 0–100 | Computed, never stored on input |
| DateRange | { start, end? } | end ≥ start |
| TaxYear | int (Israeli calendar tax year) | Registry lookups keyed by it |
| RawDataPayload | versioned zod schema: { adapterId, adapterVersion, docRef, fields: RawField[] } | Intermediate contract between adapters and domain factory; adapters may emit nothing else |
| CanonicalLedgerItem | domain factory output: LedgerItem + details + valuations + provenance | Only the factory constructs it; unknown input → SuspenseItem |
| PriorityScore | weighted composite (impact, ease, tax, risk, goals, urgency) | Weights live in AssumptionRegistry, not code |
| Recurrence | { frequency: MONTHLY/ANNUAL/ONE_TIME, interval } | — |

## 4. Aggregates & consistency boundaries

- **Household** (root) — members, workflow state. Transactional boundary for state transitions.
- **LedgerItem** (root) — its detail record, ownership shares, valuations. One transaction per item mutation.
- **ImportBatch** (root) — imported fields + suspense items of a run. A batch commits atomically; a failed batch leaves no partial ledger writes.
- **Recommendation** (root) — rationale, evidence links, assumption pins, journal entries.
- Cross-aggregate consistency (e.g., "suspense empty before STRATEGY") is enforced by domain services at transition time, not FK constraints.

## 5. Domain events (persisted to AuditEvent; in-process dispatch)

`DocumentUploaded`, `ImportBatchCompleted`, `ItemRoutedToSuspense`, `SuspenseResolved`,
`ItemVerified`, `WorkflowStateChanged`, `AssumptionVersionCreated` → triggers
`RecommendationsInvalidated`, `RecommendationProposed`, `RecommendationDecided`,
`SnapshotTaken`, `DriftDetected`.

## 6. Domain services

| Service | Context | Responsibility |
|---|---|---|
| WorkflowStateMachine | Core | Legal-transition table + guards (verification completeness, suspense emptiness) |
| LedgerFactory | Ledger | RawDataPayload → CanonicalLedgerItem or SuspenseItem; deterministic, never guesses |
| VerificationAssessor | Verification | Computes missing-document list, staleness, confidence, unresolved questions |
| NetWorthCalculator | Ledger | Multi-currency consolidation to base currency with FX provenance |
| StrategyEngine | Strategy | Graph-wide analysis → candidate recommendations → scoring → quality gate |
| ScenarioProjector | Scenario | Deterministic projections under overridden assumptions (Monte Carlo later, additive) |
| DriftDetector | Journal | Compares latest snapshot vs strategy baseline against thresholds |

<!-- END OF DOCUMENT 02 -->
