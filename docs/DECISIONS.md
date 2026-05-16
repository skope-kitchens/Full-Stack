# Skope Kitchens — Architecture Decision Record

> This document records the reasoning behind structural decisions in the inventory, procurement,
> and ledger system. It is not a rules document. It exists so that future contributors understand
> why the system is shaped the way it is and what was considered before each decision was made.
>
> Each entry follows: Context → Decision → Consequences → Alternatives Rejected → Migration Implications.

---

## ADR-01: Overwrite semantics for stock_updates are dangerous and scheduled for replacement

### Context

The initial implementation of `upsertStockUpdate` used a `findOneAndUpdate` with `$set: { items: cleaned }` against a `{ brandId, date }` unique index. This meant any re-submission on the same calendar day silently replaced the entire `items` array. The motivation was operational simplicity: ops staff who noticed an error could just resubmit without any special correction flow.

The problem became clear during analysis of the sync path. When a same-day correction is submitted, the sync computes `delta = newQty - currentBrandStockQty`. This delta is computed against the live ledger at the moment of the re-submission, not against what was previously reported. If anything happened to brand_stocks between the original submission and the correction — an issue was processed, a transfer was made — that activity is silently absorbed into the correction delta. There is no record that a correction occurred at all, and no record of what the original submission said. An auditor looking at brand_stocks history sees two RECONCILIATION entries for the same day with no explanation.

There is also a structural problem: when ops submits wrong numbers and then corrects, the wrong numbers are gone permanently. The database cannot answer the question "what did branch X report at 9am before correcting at 6pm?" This is a compliance and operational risk in a food production environment where ingredient accountability is required.

### Decision

Overwrite semantics are marked dangerous. Same-day re-submissions are to be replaced by the Immutable Revision Model (see ADR-02). Until that migration is complete, same-day upsert behavior is acknowledged as a known limitation, not a design intent. No new code should be written that assumes same-day overwrite is safe or permanent.

### Consequences

Until ADR-02 is implemented, the audit trail for same-day corrections is incomplete. Any RECONCILIATION entry in brand_stocks that was triggered by a stock_update sync may reflect a corrected count, not the original. Post-migration, all prior overwrite-based documents will be treated as version 1 of their respective day's record. They are not retroactively incorrect; they are simply unversioned.

### Alternatives Rejected

**Mirror to a separate audit collection on overwrite.** On each same-day overwrite, copy the outgoing document to a `stock_update_audit` collection before applying `$set`. This preserves history without changing the main model. Rejected because it introduces a two-step write (copy then update) where the copy can succeed and the update can fail or vice versa, leaving the audit collection inconsistent with the live document. It also means audit history lives in a separate collection with no index relationship, making reconstruction slow.

**Append a `corrections` array within the same document.** Each re-submission appends the prior items array to a corrections array in the same document. Rejected because this grows the document unboundedly and makes the "current count" a derived computation (`corrections[-1].items`) rather than a first-class field. It also makes the sync logic more complex: which corrections have been synced, which have not?

### Migration Implications

The `{ brandId, date }` unique index must be replaced with `{ brandId, date, version }`. Existing documents are retroactively treated as version 1. No data is deleted or modified. The controller logic changes to insert a new versioned document instead of overwriting, and the sync changes to compute inter-version diffs. The unique index drop-and-replace is the only destructive migration step and should be run during a low-traffic window.

---

## ADR-02: Immutable Revision Model selected as the immediate production-safe path

### Context

After identifying the overwrite model as dangerous (ADR-01), four replacement models were evaluated: overwrite (current), immutable revision, append-only snapshot, and explicit recount. The choice had to satisfy three constraints simultaneously: it had to be operationally safe immediately, it had to be migrateable without UI or ops workflow changes, and it had to be compatible with the best-effort sync architecture that keeps stock_updates decoupled from brand_stocks.

The key insight in the evaluation was that corrections to a stock count are operationally different from new stock counts: a correction is relative to what was previously reported, not to what the live ledger currently says. The overwrite model lost this distinction entirely. Any replacement model had to preserve it.

### Decision

The Immutable Revision Model was selected as the immediate safe path. Each submission creates a new versioned document. Re-submissions increment the version counter. The sync computes inter-version diffs (`v_n.remainingQty - v_{n-1}.remainingQty`), not diffs against live brand_stocks. Every version is permanently retained. A `syncApplied` flag per version enables recovery from partial sync failures without re-applying deltas that were already written.

The revision model was specifically chosen over the explicit recount model not because it is more correct, but because it requires no changes to the ops-facing UI or to the ops staff's mental model. The submission flow is identical. Version management is entirely backend. This separation between "data architecture improvement" and "ops process change" is intentional — the two should not be conflated in a single migration.

### Consequences

All correction submissions become permanently queryable: who submitted what, when, and how it differed from the prior version. RECONCILIATION entries in brand_stocks can carry a `sourceVersionId` back-reference. The inter-version diff approach means concurrent ledger mutations (issues, transfers that happened after the count) are not absorbed into corrections — they remain in brand_stocks correctly.

The trade-off is that the "current count" for a day is now a derived value (highest version), not a direct document lookup. Queries for the active count must sort by version descending. This is a minor query complexity increase with no operational impact.

The `syncApplied` flag introduces a recovery path for P1-C (partial sync loop failure): on re-submission, the system checks whether the previous version was fully synced before computing the diff. If it was not, the diff is computed against the last fully-synced version's counts instead.

### Alternatives Rejected

**Append-only snapshot model.** Each submission is an independent document. Corrections void prior documents and submit new ones. Rejected because voiding a document that has already been synced to brand_stocks requires a reversal write to brand_stocks — a new write path (`RECONCILIATION_REVERSAL`) that introduces its own partial-failure scenarios. Under the best-effort sync design, this creates a three-step process (submit → void → resubmit) where any step can partially fail and leave brand_stocks in an indeterminate state. The query complexity for "active count today" (latest non-voided) also adds operational overhead without compensating benefit in a kitchen ops context.

**Staying on overwrite with better logging.** Adding structured logs of what was overwritten, without changing the data model. Rejected because logs are not queryable, cannot be joined with brand_stocks history, and are not durable in the same way as database records. Audit-heavy operations require database-level evidence, not log-level evidence.

### Migration Implications

Phase 1 migration: add `version` (default 1), `submittedBy`, `idempotencyKey`, and `syncApplied` fields to the StockUpdate model. Drop the `{ brandId, date }` unique index and replace with `{ brandId, date, version }`. Add `{ brandId, date, idempotencyKey }` for retry safety. Update controller to read the highest current version before inserting version n+1. Update sync logic to compute inter-version diffs. This migration does not require UI changes and does not affect existing documents.

---

## ADR-03: Explicit Recount Model is the long-term target architecture

### Context

The immutable revision model (ADR-02) solves the audit history problem and is safe to deploy immediately. However, it does not solve a distinct operational problem: in the revision model, there is no semantic distinction between "I am submitting the day's count for the first time" and "I made an error and am correcting a prior submission." Both actions produce a new version. A version 3 document could mean three independent counts, or one count and two corrections, or one count, one accidental duplicate, and one correction. The version number alone does not convey intent.

In a food production environment where ingredient accountability is subject to operational review, this ambiguity matters. If a manager asks "were any stock counts corrected this week and why?", the revision model cannot answer the "why" — it only shows that a higher version was submitted. The explicit recount model makes corrections first-class objects with mandatory fields: `correctionReason`, `correctedBy`, `correctedAt`, and a pointer to the original count. Corrections cannot be submitted without declaring intent.

### Decision

The explicit recount model is designated as the long-term target. The migration from revision model to explicit recount is Phase 2 and is deferred until ops workflows are stable and the team has capacity for the associated UI and training changes. Under the explicit recount model: the original count for a `(brandId, date)` is locked after first submission; corrections go through a distinct flow that requires selecting the count being corrected and providing a reason; the sync on a correction applies the diff between original and corrected counts.

### Consequences

The explicit recount model requires a UI change: a "correct a count" flow distinct from "submit a count." It also requires ops staff to understand that they cannot simply resubmit. This is a process change, not just a technical change. The migration from revision model to explicit recount is not a breaking change to existing data — revision model documents can be treated as the original count, and any future corrections produce recount records against them.

The benefit is significant for operational review: correction frequency, correction magnitude, time-to-correction, and correction reason are all first-class queryable fields. High correction rates at specific branches become visible as a data signal.

### Alternatives Rejected

**Stay on revision model permanently.** The revision model is safe and provides audit history. It would be reasonable to stop there. Rejected as the long-term target because it leaves corrections as implicit (version diff) rather than explicit (declared reason). For a growing operation with multiple branches, implicit corrections make operational review harder as volume increases.

**Free-text notes field on revision model.** Allow a `correctionNote` optional field on any version, making version 2+ submissions optionally annotated. Rejected because optional fields are not reliably filled in under operational pressure. Mandatory fields on a distinct correction flow are the only mechanism that produces consistent data.

### Migration Implications

The Phase 2 migration requires: a new `recount` collection (or embedded correction scheme within StockUpdate), UI changes to surface a "correct a count" flow, ops training, and an update to the sync logic to use recount diffs. The revision model remains in place as the base layer — recounts reference revision documents by `_id`. This migration can be done feature-flag gated: the "correct a count" UI is hidden until ops is trained, after which the old "resubmit" behavior is retired.

---

## ADR-04: brand_stocks is the single authoritative quantity source

### Context

The system contains multiple collections that hold or imply ingredient quantities: `brand_stocks` (live ledger), `stock_updates` (physical counts), `kitcheninventory` (client-facing), and Rista (external POS/inventory). Early in the design, it was possible to argue for any of these as the source of truth. Each had a case: stock_updates are regularly measured by humans, kitcheninventory is directly managed by clients, Rista has real-time POS data.

The decision had to account for a specific property of the inventory problem: quantities change through multiple mutation types (issues from indents, inter-brand transfers, reconciliation corrections, sync deltas) that happen on different timelines, by different actors, with different frequency. No single physical measurement source captures all of these.

### Decision

`brand_stocks` is the single source of truth for ingredient quantities. All other collections are informational. No quantity read that drives a business decision (cost calculation, indent creation, availability check) should read from any other collection. Writes to `qtyRemaining` are only permitted through the four documented mutation paths: ISSUE, TRANSFER, RECONCILIATION (manual), and RECONCILIATION (sync delta).

### Consequences

Every other collection becomes a consumer of brand_stocks, not a co-equal source. stock_updates sync into brand_stocks rather than replacing it. kitcheninventory is managed independently as a client-facing view, not as a ledger. Rista data, when live, informs reconciliation decisions but does not write to brand_stocks directly.

The consequence is that brand_stocks must be kept accurate through disciplined mutation controls. If brand_stocks drifts (due to sync failures, missed issues, or unrecorded wastage), the drift is visible and measurable against physical counts from stock_updates. This is the correct failure mode: the discrepancy surfaces rather than being masked.

### Alternatives Rejected

**stock_updates as the authoritative source.** Physical counts are ground truth for what is physically present. Making stock_updates authoritative would mean brand_stocks is derived from counts rather than tracked through mutations. Rejected because physical counts happen once per day, while mutations (issues, transfers) happen continuously. A count-based system would have 23 hours of staleness between any two counts, making real-time indent and transfer decisions unreliable.

**Rista as the authoritative source.** Rista has real-time POS data and may have ingredient-level tracking. Rejected because Rista is an external system with no write-back capability and an integration that is not yet fully live. Making an external, partially-available system the authoritative source for production kitchen operations introduces an availability dependency that cannot be tolerated. If Rista is unreachable, the kitchen cannot operate.

**Derived authority: compute stock from transaction log.** Treat brand_stocks as a cache derived from the full history of issues, transfers, and reconciliations. Always compute current qty by replaying history. Rejected because history replay is expensive, requires locking during reads, and complicates concurrent writes significantly. The embedded history array exists for auditability, not as the primary query surface.

### Migration Implications

No migration required — this decision was made at the system's inception and is already the operational state. Any future integration (Rista, ERP, external supplier systems) must be designed to flow through the brand_stocks mutation paths rather than writing directly.

---

## ADR-05: stock_updates are audit snapshots, not the ledger

### Context

When the stock_update feature was designed, there was a fork in the road: treat stock_updates as the operational ledger (quantities come from here, issues and transfers are transactions against it) or treat them as a timestamped audit layer that captures what ops physically observed at a point in time. The first approach would make stock_updates the center of the inventory system. The second approach makes brand_stocks the center and stock_updates a peripheral input.

The schema itself reveals the intended design: `stockItemSchema` captures `issueQty`, `usedQty`, `wastageQty`, and `remainingQty`. This is not a ledger entry — it is an operational observation. It answers "what happened today" rather than "what is the current state." A ledger entry records a single transaction. A stock_update record is a daily snapshot of multiple independent facts.

### Decision

stock_updates are audit snapshots. They record what ops staff physically observed on a given day. They are not the ledger and must not be queried as a substitute for brand_stocks when current quantity is needed. The sync from stock_updates into brand_stocks is a best-effort reconciliation bridge, not a primary data flow. If the sync fails, the stock_update is still a valid audit record; the failure is in the reconciliation, not in the snapshot itself.

### Consequences

The sync failure modes are bounded: a failed sync means brand_stocks drifts from the physical count, but both the stock_update (what was counted) and brand_stocks (what the system believes) remain internally consistent. The drift is detectable and correctable by re-running the sync or by manual reconciliation.

The `issueQty`, `usedQty`, and `wastageQty` fields in stock_updates are currently unused by the sync. They exist as operational data for potential future reporting (wastage trends, usage efficiency). They do not affect brand_stocks. This is intentional — only `remainingQty` feeds the reconciliation bridge because it is the only field that represents the current physical state.

### Alternatives Rejected

**stock_updates as the primary mutation surface.** Issues and transfers are recorded in stock_updates; brand_stocks is derived. Rejected because issues and transfers are immediate, real-time operations driven by recipe requirements. They cannot wait for the daily stock update cycle. Mixing time-sensitive mutations with daily observations in the same collection creates a system where the timing semantics of records vary by type, which complicates querying, sorting, and reporting.

**stock_updates as a trigger for mandatory brand_stocks updates.** Make the sync synchronous and mandatory — if the sync fails, the stock_update is rejected. Rejected because this creates a hard dependency between ops' ability to log physical counts and the availability of brand_stocks. A transient database issue should not prevent ops from recording their observations. The audit record has value independent of whether the reconciliation was applied.

### Migration Implications

When the revision model (ADR-02) is implemented, the sync logic changes from "delta against live brand_stocks" to "inter-version delta." This does not change the fundamental nature of stock_updates as snapshots — it only changes how the reconciliation bridge computes the delta. The snapshot semantics remain unchanged.

---

## ADR-06: Rista is informational-only and must never become ledger authority

### Context

Rista is an external POS and inventory management platform used for operational tracking in physical branches. It has real-time data including item quantities and sales. When the inventory system was being designed, a question arose about whether Rista's quantity data could replace or supplement brand_stocks, given that Rista's counts might be more current than the daily stock_update snapshots.

There are two structural reasons why Rista cannot be ledger authority, regardless of data quality: first, there is no write-back path — the system cannot record its own mutations (issues, transfers) into Rista, so Rista's data does not reflect this system's decisions. Second, Rista is not fully integrated yet — routes and client code exist but live data may not be reachable in all environments. Making an only-partially-available integration authoritative over production operations is a structural reliability failure.

### Decision

Rista is a read-only external boundary. It provides data that can inform decisions (analytics, trend reporting, stock level visibility) but has no authority over `brand_stocks.qtyRemaining`. Any future Rista-to-brand_stocks data flow must go through the controlled reconciliation path: a human or a confirmed automated process reads Rista data and makes an explicit reconciliation decision. Rista does not write to brand_stocks directly.

### Consequences

When the Rista integration is fully live, its data will be most useful for detecting discrepancies between what the system believes and what Rista observes at the branch level. This is a quality signal, not an authoritative override. The reconciliation endpoint exists for an operator to review the discrepancy and decide whether to apply it.

This means the system will always require a human in the loop for Rista-sourced corrections (under the explicit recount model, ADR-03, Rista data can populate a correction form that ops staff reviews and approves before it is applied). This is a deliberate choice in an audit-heavy environment.

### Alternatives Rejected

**Automated Rista sync directly into brand_stocks.** Rista quantities update brand_stocks automatically without human review. Rejected because Rista measures what the POS system sees, which may differ from kitchen-level stock for reasons the system does not understand (items reserved, counts not updated, branch-specific storage). An automated sync that treats POS data as equivalent to kitchen physical counts would introduce systematic errors that are hard to detect.

**Rista as the primary count source, stock_updates as secondary.** Use Rista quantities to drive the daily reconciliation instead of human physical counts. Rejected for the same reason: Rista data reflects POS activity, not kitchen inventory. The two are related but not equivalent. A kitchen can have ingredient stock that never flows through the POS.

### Migration Implications

When Rista integration becomes fully live, the integration boundary must be codified in the routes: Rista data flows into analytics routes only. If an operator-confirmed Rista sync to brand_stocks is desired, it should go through the reconciliation endpoint with a `source: "RISTA"` note in the history entry — not through a new direct write path. No controller should be written that reads Rista data and calls `BrandStock.findOneAndUpdate` without the reconciliation path's validation and history semantics.

---

## ADR-07: Manual reconciliation is an exceptional operation, not a routine one

### Context

In a system where brand_stocks tracks quantities through mutations, there will always be drift between the ledger and physical reality: unlogged wastage, measurement errors, theft, spillage. The question was whether reconciliation should be a routine part of every stock_update cycle (run it every time a count is submitted) or an exceptional operation requiring deliberate intervention.

The danger of routine reconciliation is that it normalizes the ledger to physical counts continuously. This sounds desirable but has a hidden cost: if ops staff make a counting error, the error is immediately absorbed into the authoritative ledger with no friction. More importantly, routine reconciliation makes it impossible to distinguish between normal ledger drift (which is expected and manageable) and systematic counting errors or process failures (which require investigation).

### Decision

Manual reconciliation (`POST /api/brand-stock/:id/reconcile`) is an exceptional operation. It requires the INGREDIENT_MANAGER role. It produces a RECONCILIATION history entry with `previousQty`, `newQty`, and a mandatory `note`. It is not called automatically by any routine flow. The automated sync from stock_updates uses `$inc` delta (not `$set`) specifically to avoid overwriting the ledger with every physical count — only a deliberate manual reconciliation uses `$set`.

The distinction between the two reconciliation paths is intentional: manual reconciliation says "the physical count is the ground truth, override the ledger." Automated sync says "adjust the ledger by the difference I observe, but do not clobber concurrent mutations." These are different operational semantics and should remain different code paths.

### Consequences

Drift between brand_stocks and physical counts is expected and visible. It accumulates between manual reconciliations. This is the correct failure mode — visible drift signals a need for investigation, whereas invisible automatic correction masks the signal. When a manual reconciliation is performed, the note field captures the reason (e.g., "end-of-week stock take", "post-event count"), making the reconciliation event itself auditable.

The no-op early return (`previousQty === newQty`) prevents spurious reconciliation entries when a human submits a count that matches the ledger. This matters for audit log cleanliness — a RECONCILIATION entry with `previousQty === newQty` is noise and would make trend analysis unreliable.

### Alternatives Rejected

**Auto-reconcile on every stock_update submission.** Use `$set` in the sync path rather than `$inc` delta, making each submission a full physical-count override. Rejected because `$set` in the sync path would clobber concurrent issues and transfers that occurred between the measurement and the sync write. A branch manager who issues 20kg of flour for a recipe and then runs a sync based on a count taken before the issue would silently reverse the issue credit.

**No manual reconciliation endpoint, corrections only through recount.** Require all quantity corrections to go through the stock_update correction flow. Rejected because stock_updates operate at item-name level without ingredientBrand granularity, while brand_stocks tracks at `{ brandName, itemName, ingredientBrand }` granularity. A physical count cannot always resolve to a specific ingredientBrand. The reconciliation endpoint operates directly on brand_stocks documents by `_id`, which is the appropriate granularity for ledger correction.

### Migration Implications

When the revision model (ADR-02) is implemented and the sync moves to inter-version diffs, the manual reconciliation endpoint's semantics are unchanged. The `$set` path for manual reconciliation remains a deliberate override. The two paths remain distinct. The reconciliation endpoint does not need to change to accommodate the revision model migration.

---

## ADR-08: Transfer source debit requires atomic filter guard, not read-then-write

### Context

A stock transfer moves quantity from one brand's ledger record to another. The naive implementation reads the source balance, checks if it is sufficient, and if so writes the debit. This is a classic Time-of-Check-to-Time-of-Use (TOCTOU) race: between the read and the write, a concurrent transfer or issue can reduce the balance. Both concurrent requests can pass the balance check independently and both execute, producing a negative balance in the source record.

MongoDB does not provide pessimistic row-level locking in the manner of SQL databases. The mechanism available for atomic conditional writes is the query filter in `findOneAndUpdate`: the update only applies if the document matches the filter at the time of the write operation. This is atomic at the document level.

### Decision

The transfer debit uses `findOneAndUpdate` with `{ qtyRemaining: { $gte: quantity } }` in the query filter. The balance check and the debit are not separate operations — they are the same operation. If the balance is insufficient at write time (even if it was sufficient at request time), `findOneAndUpdate` returns null and the operation fails cleanly without writing anything. This is the only acceptable pattern for any operation that debits `qtyRemaining`.

The consequence of this design is that the diagnostic error message (insufficient balance vs. non-Pending status) requires a secondary read after the null return. This secondary read is acceptable because it is diagnostic only — it never drives a write. The actual safety guarantee comes from the atomic filter, not from the diagnostic read.

### Consequences

Concurrent transfer requests against the same source record are safe: only the requests that find sufficient balance at write time will succeed. The first request to execute reduces the balance; subsequent concurrent requests fail if the remaining balance is insufficient. No overdraft is possible at the database level.

The limitation is that the debit and credit are still two separate operations (not a transaction). If the debit succeeds and the credit fails, the quantity has left the source with no destination — a half-committed transfer. This is the P1-A gap identified in the hardening roadmap and requires MongoDB sessions to fully close. The atomic filter guard solves the concurrency problem but not the two-phase commit problem.

### Alternatives Rejected

**Optimistic locking with version fields.** Add a `__v` version field to brand_stocks documents. Read, increment, write with version check in the filter. Rejected because Mongoose already provides `__v`, but optimistic locking requires a retry loop on version conflict — this does not prevent the TOCTOU race, it just detects it and requires retry. Under high concurrent load, retries become expensive. The atomic balance filter is strictly safer because it never requires retry — it either succeeds or fails definitively.

**MongoDB transactions for the full transfer.** Wrap debit and credit in a `session.withTransaction()`. This would close both the concurrency problem and the half-commit problem simultaneously. Not rejected as the long-term solution — this is the correct final answer. Deferred because it requires a confirmed replica set (Atlas M10+) and the engineering overhead of session management. The atomic filter guard is the safe intermediate position until sessions are enabled.

**Application-level lock (Redis, in-memory mutex).** Acquire a lock on `(brandName, itemName, ingredientBrand)` before executing the transfer. Rejected because it requires an external lock service (Redis) or shared application state, both of which introduce new infrastructure dependencies and failure modes. The MongoDB-native atomic filter is simpler, more reliable, and has no external dependencies.

### Migration Implications

When MongoDB sessions are enabled (ADR-08 full close), the atomic filter guard does not need to be removed — it remains as defense-in-depth. The session wraps the entire debit+credit pair; the filter guard prevents overdraft within the session. The two mechanisms address different failure modes and are complementary.

---

## ADR-09: Hard deletes on ledger documents are forbidden

### Context

MongoDB's `findByIdAndDelete` and `deleteOne` permanently remove a document and all its embedded data, including the `history` array in brand_stocks. In the early implementation, `deleteBrandStockItem` used `findByIdAndDelete`. The rationale was straightforward: ops staff needed a way to remove erroneous or test records from the ledger.

The problem with hard deletion in an audit-heavy inventory system is that deletion destroys evidence retroactively. A brand_stocks document that was hard-deleted takes its entire history array with it. Any RECONCILIATION, ISSUE, or TRANSFER entries that reference that document's brand+item combination now have no corresponding document to point to. If an ISSUED indent credited a stock record that was later hard-deleted, the credit has no traceable origin — it exists in brand_stocks history but the document that held the history is gone.

More concretely: if an auditor asks "show me every mutation for Brand A's flour supply over the past 3 months," a hard-deleted record produces a silent gap in that timeline with no indication that a gap exists.

### Decision

Hard deletes are forbidden on `brand_stocks`, `ingredientIndents` (for ISSUED status), and `stock_updates` (for prior dates). `brand_stocks` records are soft-deleted by setting `status: "Archived"`. The document remains in the collection, its history array remains intact, and it remains queryable. Archived records are excluded from operational queries (transfer balance checks use `status: "Pending"` filter) but included in audit queries (`listAllBrandStock` returns all statuses).

The `deleteBrandStockItem` controller was changed from `findByIdAndDelete` to `findByIdAndUpdate($set: { status: "Archived" })` specifically to enforce this.

### Consequences

Collections grow over time. Archived documents accumulate. For a multi-brand kitchen operation with many ingredients over many months, this growth is manageable — brand_stocks documents are small (history arrays are bounded by the number of mutations, not by time). The trade-off between storage growth and audit completeness is strongly in favor of retention.

Archived records are not visible in operational UIs by default. Filtering by `status: "Archived"` surfaces them when needed. This means ops staff who look at the stock list do not see confusion from archived records, while administrators and auditors can access the full picture.

### Alternatives Rejected

**Hard delete with backup to archive collection.** Before deleting, copy the document to a `brand_stocks_archive` collection, then delete from `brand_stocks`. Rejected because this is a two-step operation where either step can fail. If the copy succeeds and the delete fails, there are two copies. If the delete succeeds and the copy fails, the record is gone permanently — the worst case. Soft delete is a single atomic operation with no failure modes.

**Hard delete with event log.** Before deleting, write a deletion event to an event log collection. Rejected for the same two-step failure reason. Additionally, an event log captures the fact of deletion but not the full history array — auditors can see that a document was deleted but cannot reconstruct what mutations it contained.

**TTL-based expiry for old records.** Use MongoDB's TTL index to expire records after a defined period. Rejected because financial and operational audit requirements typically have multi-year retention needs, and the records are small enough that storage is not a constraint. TTL expiry would create invisible data gaps in historical queries.

### Migration Implications

All existing brand_stocks records created before this decision are treated as `status: "Pending"` by default (the Mongoose schema default). No data migration required. Any code in the codebase that calls `findByIdAndDelete` on brand_stocks, ingredientIndents, or stock_updates must be audited and replaced with the appropriate soft-delete pattern before the next deployment.

---

## ADR-10: Ledger history is append-only and embedded in the document

### Context

When brand_stocks was designed, a choice was made about where to store mutation history: embedded in the document as a `history: [historySchema]` array, or in a separate `brand_stock_history` collection with foreign key references. Simultaneously, a choice was made about mutability: can history entries be edited or deleted (`$pull`, `$set` on array elements), or are they write-once?

These two choices are related. If history is in a separate collection, individual entries can be deleted without touching the main document. If history is embedded, `$pull` or `$set` can modify it in the same operation that modifies `qtyRemaining`. The choices affect both the integrity model and the operational properties of every mutation.

### Decision

History is embedded in the brand_stocks document and is append-only. Every mutation pushes to `history` using `$push` in the same `findOneAndUpdate` call that modifies `qtyRemaining`. No operation may use `$pull` or `$set` on individual history array elements. History entries, once written, are permanent for the lifetime of the document.

The append-only constraint is what makes INV-L1 (qtyRemaining never mutates without a history entry) enforceable: since all qtyRemaining mutations use a single `findOneAndUpdate` call that atomically includes the `$push`, the history entry and the quantity change are either both committed or neither is.

### Consequences

Brand_stocks documents grow over time as the history array accumulates entries. For active ingredients at high-volume brands, a document might accumulate hundreds of history entries over months of operation. This is a bounded growth — the document size grows by the number of mutations, not by time — and MongoDB documents handle arrays of this size without performance degradation at the query level.

The embedded model means that `findById` or `findOne` on a brand_stocks document returns the full history without a join. This is the appropriate performance characteristic for an audit query: an auditor examining a specific stock record should see all its history in a single read.

The constraint that history is append-only means mistakes in history entries cannot be silently corrected. If a history entry records an incorrect `previousQty` (due to the TOCTOU gap in reconcileStock identified in ADR-07), that incorrect entry is permanent. The correct response is to add a subsequent entry that acknowledges and corrects the record — not to retroactively edit the prior entry. This is consistent with how financial ledgers work: corrections are new entries, not edits to prior ones.

### Alternatives Rejected

**Separate history collection with foreign key.** Store history entries in `brand_stock_history` with a `stockDocId` reference. Individual history entries can be queried, paginated, and indexed independently. Rejected for two reasons: first, atomicity is lost — the `qtyRemaining` update and the history insert are now two operations that can partially fail. Second, the query for "show me this stock record's full history" now requires a join, which adds latency and query complexity for what is a fundamental operational read.

**Capped history array (keep last N entries).** Use MongoDB's `$push` with `$slice` to keep only the most recent N history entries, discarding old ones. Rejected because discarding history entries violates the audit completeness requirement. An auditor who asks for the full mutation history of a stock record must receive it. Capping the array creates invisible gaps.

**History as a separate field updated on each write.** Instead of pushing a new entry, maintain a running summary (total issued, total transferred, last reconciliation date). Rejected because a summary loses the per-event timeline, which is precisely what is needed for root cause analysis when a discrepancy is found.

### Migration Implications

The embedded history model is already in production. The append-only constraint is a code-level discipline commitment rather than a schema enforcement (MongoDB does not natively prevent `$pull` on an array). The enforcement mechanism is code review: no operation on brand_stocks should include `$pull` or element-level `$set` on the history field. If document growth becomes a concern in the future, the correct response is to archive old documents (ADR-09 soft archive) rather than pruning their history.
