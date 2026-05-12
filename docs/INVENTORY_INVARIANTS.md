# Skope Kitchens — Runtime Inventory Invariants

> These are invariants, not guidelines. If any of these are violated in production,
> data integrity is compromised. Each entry states the invariant, why breaking it is
> dangerous, and which code currently enforces it.

---

## 1. Ledger Integrity Invariants

### INV-L1: qtyRemaining never mutates without a history entry
**Invariant:** Every write to `brand_stocks.qtyRemaining` must atomically push a typed
`history` entry `{ type, qty, uom, at }` in the same update operation.

**Why dangerous:** Silent quantity changes are unauditable. If qtyRemaining drifts without
history, root cause analysis is impossible and reconciliation cannot be trusted.

**Enforced by:**
- `issueIndentItem` — `$inc qtyRemaining` + `$push history.ISSUE` in one `findOneAndUpdate`
- `transferBrandStock` — debit and credit each include `$push history.TRANSFER_OUT / TRANSFER_IN`
- `reconcileStock` — `$set qtyRemaining` + `$push history.RECONCILIATION` in one update
- `stockUpdate.controller.js` sync block — `$inc` + `$push history.RECONCILIATION` in one update

---

### INV-L2: brand_stocks is the single authoritative qty source
**Invariant:** The live ingredient quantity for a brand is `brand_stocks.qtyRemaining`.
`stock_updates`, `kitcheninventory`, and Rista data are never used as substitutes.

**Why dangerous:** If two sources are treated as authoritative, concurrent mutations to each
diverge silently. Downstream costing and indent calculations become wrong without any error.

**Enforced by:**
- All quantity reads in the transfer, reconcile, and indent flows query `brand_stocks` directly
- `stock_updates` controller syncs into `brand_stocks` — it does not serve as the source

---

### INV-L3: Stock must never disappear silently
**Invariant:** A quantity decrease in `brand_stocks` must be causally linked to one of:
`TRANSFER_OUT`, `RECONCILIATION` (physical count lower), or `RECONCILIATION` (sync delta negative).
There is no deletion path that removes qty.

**Why dangerous:** Silent stock loss looks identical to theft, system error, or data corruption.
It makes stock takes impossible to reconcile against historical records.

**Enforced by:**
- No hard-delete path on `brand_stocks` documents (soft archive only — `INV-A1`)
- `deleteBrandStockItem` sets `status: "Archived"`, does not touch `qtyRemaining`
- No controller writes a negative `$inc` to `qtyRemaining` without a matching history entry

---

## 2. Transfer Invariants

### INV-T1: Global quantity is conserved across a transfer
**Invariant:** A transfer of `qty` units from brand A to brand B must debit A by exactly `qty`
and credit B by exactly `qty`. The system-wide total across all `brand_stocks` records for the
same `itemName + ingredientBrand` must remain conserved for the duration of the transfer operation itself.

**Why dangerous:** If debit succeeds and credit fails (or vice versa), stock is created or destroyed
without a physical event. This is unrecoverable without a full manual audit.

**Enforced by:**
- `transferBrandStock` — source debit and destination credit use the same `quantity` value
- If source `findOneAndUpdate` returns null (balance check failed), the operation aborts before
  any credit is attempted — no partial state

---

### INV-T2: Source debit must be atomic with the balance check
**Invariant:** The check `qtyRemaining >= qty` and the debit `$inc: { qtyRemaining: -qty }` must
happen in a single `findOneAndUpdate` operation. Never read-then-write.

**Why dangerous:** Two concurrent transfer requests can both pass a read-time balance check and
both execute, overdrafting the account.

**Enforced by:**
- `transferBrandStock` uses `findOneAndUpdate({ qtyRemaining: { $gte: quantity } }, { $inc: ... })`
- The filter IS the balance check; the update only applies if the filter matches

---

### INV-T3: Self-transfers are rejected
**Invariant:** `fromBrandName` must not equal `toBrandName`.

**Why dangerous:** A self-transfer produces two offsetting history entries and wastes an audit trail
entry, but more critically it creates an opportunity for bugs that double-count or zero-out stock.

**Enforced by:**
- `transferBrandStock` — explicit `from === to` check returns 400

---

## 3. Reconciliation Invariants

### INV-R1: Manual reconciliation uses absolute set, not delta
**Invariant:** `POST /api/brand-stock/:id/reconcile` must write `$set: { qtyRemaining: newQty }`.
Physical count is ground truth; it overwrites the ledger.

**Why dangerous:** Using `$inc` for a manual physical count compounds errors. If the ledger is
already wrong, adding a delta makes it wronger. Physical counts exist precisely to reset drift.

**Enforced by:**
- `reconcileStock` — uses `$set: { qtyRemaining: newQty }`, records `previousQty` and `newQty` in history

---

### INV-R2: Automated sync uses delta, not absolute set
**Invariant:** The stockUpdate sync block must write `$inc: { qtyRemaining: delta }` where
`delta = newQty - previousQty`. It must not overwrite with `$set`.

**Why dangerous:** An absolute `$set` from the sync block would clobber concurrent legitimate
mutations (transfers, issues) that happened between the stock_update measurement and the sync write.

**Enforced by:**
- `stockUpdate.controller.js` sync block — computes delta, applies `$inc`

---

### INV-R3: No-op reconciliation must not write history
**Invariant:** If `previousQty === newQty`, the reconcile endpoint returns early without writing
a history entry.

**Why dangerous:** Spurious RECONCILIATION entries pollute the audit log, making genuine
reconciliation events harder to identify and trend-analyze.

**Enforced by:**
- `reconcileStock` — early return `{ success: true, unchanged: true }` when qty is unchanged

---

## 4. Indent Lifecycle Invariants

### INV-I1: ISSUED indents cannot be deleted
**Invariant:** A `deleteIndentItem` call on an `ISSUED` indent must be rejected with 409.
Once an indent is ISSUED, a reversal entry must be raised instead.

**Why dangerous:** Deleting an ISSUED indent creates phantom brand_stocks credit — stock
appears in the ledger with no corresponding audit record tracing its origin.

**Enforced by:**
- `deleteIndentItem` — checks `doc.status === "ISSUED"`, returns 409

---

### INV-I2: brand_stocks credit must precede ISSUED status
**Invariant:** In `issueIndentItem`, the `BrandStock.findOneAndUpdate` (credit) must succeed
before `doc.status = "ISSUED"` is persisted. If the credit fails, the outer catch returns 500
and the indent remains `INDENT_VERIFIED`.

**Why dangerous:** If ISSUED status is saved before the credit succeeds, the indent is marked
done but the brand has no stock. The system shows a lie. Retrying is no longer safe because
the duplicate-issue guard (`status !== "INDENT_VERIFIED"`) will block it.

**Enforced by:**
- `issueIndentItem` — `BrandStock.findOneAndUpdate` called before `doc.save()`, no inner try/catch
  swallowing the credit error

---

### INV-I3: Status transitions are one-directional
**Invariant:** `INDENT_PENDING` → `INDENT_VERIFIED` → `ISSUED`. No skipping steps,
no reverting to an earlier status.

**Why dangerous:** Skipping INDENT_VERIFIED bypasses cost capture. The brand receives stock with
`cost: 0`, which corrupts food cost reporting.

**Enforced by:**
- `issueIndentItem` — checks `doc.status !== "INDENT_VERIFIED"`, returns 400 if not met
- `verifyIndentItem` — checks `doc.status === "ISSUED"`, rejects if already issued

---

## 5. Auditability Invariants

### INV-A1: No hard deletes on ledger documents
**Invariant:** `brand_stocks`, `ingredientIndents`, and `stock_updates` documents must be treated
operationally as non-destructive records. Use soft archive (`status: "Archived"`) for brand_stocks;
reject deletion for ISSUED indents; treat stock_updates as immutable for prior dates.

**Why dangerous:** Hard deletes destroy the audit trail. A deleted ISSUED indent means the
corresponding brand_stocks credit has no traceable origin. A deleted brand_stocks document means
the history array is gone permanently.

**Enforced by:**
- `deleteBrandStockItem` — `$set: { status: "Archived" }`, not `findByIdAndDelete`
- `deleteIndentItem` — 409 for ISSUED status; PENDING/VERIFIED records can be deleted pre-issue
- `stock_updates` controller — prior-date records are not overwritten

---

### INV-A2: All history entries include a timestamp
**Invariant:** Every `history` push must include `at: new Date()`. History entries without
timestamps cannot be ordered or trend-analyzed.

**Enforced by:**
- All `$push history` blocks in `issueIndentItem`, `transferBrandStock`, `reconcileStock`,
  and the stockUpdate sync block include `at: new Date()`

---

### INV-A3: Archived stock remains historically queryable
**Invariant:** Archived brand_stocks documents are never deleted. They must be returned in
full-history queries (e.g., `listAllBrandStock`) or filterable by status.

**Why dangerous:** Archiving a stock record after usage patterns are established and then
deleting it means historical transfer and issue records reference a document that no longer exists.

**Enforced by:**
- `listAllBrandStock` — queries all statuses including "Archived"
- `deleteBrandStockItem` — sets Archived, does not remove the document

---

## 6. Recipe Expansion Invariants

### INV-RE1: Expansion must always terminate
**Invariant:** `expandRecipeToLeafIngredients` must maintain a `visited: Set<string>` of
sub-recipe IDs across the recursion. If a sub-recipe ID is already in `visited`, skip it
with a warning. This prevents infinite loops on circular BOM graphs.

**Why dangerous:** Circular sub-recipe references exist in production data. Without cycle
protection, expansion loops until stack overflow or OOM, crashing the backend process.

**Enforced by:**
- `recipeIndentIngredients.controller.js` — `visited` Set passed through recursion,
  `visited.add(subId)` before recurse, `visited.delete(subId)` after (backtracking)

---

### INV-RE2: Sub-recipe quantities are yield-scaled
**Invariant:** When a sub-recipe is referenced with `qty` grams, its ingredient quantities
must be scaled by `qty / batchYield`. If `batchYield` is 0 or absent, use `scaleFactor = qty`
and log a warning — do not skip the ingredient.

**Why dangerous:** Without yield scaling, sub-recipe quantities are treated as absolute grams
regardless of batch size. A 1.5g reference to a sub-recipe with a 1000g batch yield produces
1000x inflated ingredient quantities, making indent amounts nonsensical.

**Enforced by:**
- `expandRecipeToLeafIngredients` — `scaleFactor = batchYield > 0 ? qty / batchYield : qty`

---

### INV-RE3: Only leaf ingredients appear in expansion output
**Invariant:** The expansion output must contain only raw ingredients (items with no sub-recipe
children). Sub-recipe nodes must not appear in the final list passed to indent creation.

**Why dangerous:** If a sub-recipe node reaches indent creation, an indent is raised against a
recipe name rather than a purchasable ingredient SKU. The INGREDIENT_MANAGER cannot fulfill it.

**Enforced by:**
- Recursive expansion continues until `subRecipeId` is null/absent — only then is the item added
  to the output array

---

## 7. External Integration Invariants

### INV-EX1: External systems are never ledger authority
**Invariant:** Rista (and any future external data source) must never directly set
`brand_stocks.qtyRemaining`. External data may inform reconciliation decisions, but the
write must go through the controlled reconciliation path.

**Why dangerous:** If an external system can set stock directly, it bypasses history logging,
role gates, and balance guards. Any bug or sync error in the external system silently corrupts
the ledger.

**Enforced by:**
- No route or controller reads from Rista and writes directly to `brand_stocks`
- Rista routes are analytics-facing only

---

### INV-EX2: External integration unavailability must not affect core operations
**Invariant:** If Rista is unreachable, all brand_stocks, indent, transfer, and reconciliation
operations must continue to function normally. Rista is not in any critical path.

**Why dangerous:** Making core operations Rista-dependent creates a single point of failure
for the entire procurement and stock system whenever the external API is down.

**Enforced by:**
- Rista calls are isolated to analytics routes; they are not called from indent or stock controllers

---

## 8. Failure Handling Invariants

### INV-F1: Partial commits must not occur silently
**Invariant:** If a multi-step operation (e.g., issue indent = credit brand_stocks + save ISSUED status)
fails mid-way, the failure must surface as a 500 and leave the system in a retryable prior state.
No inner try/catch may swallow the error and return a false success.

**Why dangerous:** A silent partial commit (stock credited, status not updated, or vice versa) means
the system's two sources of truth diverge permanently. The only recovery is controlled reconciliation
and audit correction.

**Enforced by:**
- `issueIndentItem` — no inner try/catch around BrandStock update; failure propagates to outer catch
  which returns 500; indent remains INDENT_VERIFIED and is safe to retry

---

### INV-F2: Best-effort sync failures must not block primary writes
**Invariant:** The `stockUpdate.controller.js` brand_stocks sync is best-effort. If the sync fails,
the stock_update record must still be saved and 200 returned. The failure must be logged.

**Why dangerous:** If sync failure blocks the stock_update response, ops staff cannot log physical
counts whenever there is a transient DB issue. The audit record itself becomes unavailable.

**Enforced by:**
- `stockUpdate.controller.js` — sync block is after `stockUpdate.save()`, wrapped so failures
  are logged but do not affect the response

---

## 9. Concurrency Invariants

### INV-C1: Balance checks and debits are inseparable
**Invariant:** Any operation that debits `qtyRemaining` must use `findOneAndUpdate` with the
balance condition in the query filter, not a prior `.findOne` + conditional `.save()`.

**Why dangerous:** Two concurrent requests that both read the same balance will both pass the
check and both execute, overdrafting the account. This is a classic TOCTOU race.

**Enforced by:**
- `transferBrandStock` — `findOneAndUpdate({ qtyRemaining: { $gte: quantity } }, { $inc: ... })`

---

### INV-C2: Upsert on credit is safe for concurrent creation
**Invariant:** When crediting a brand that may not yet have a record for this ingredient,
use `upsert: true` on the `findOneAndUpdate`. Never check-then-insert.

**Why dangerous:** Two concurrent issue/transfer operations crediting the same (brandName, itemName,
ingredientBrand) combination could both find no document, both insert, and one fails with a
duplicate-key error — losing a credit.

**Enforced by:**
- `issueIndentItem` — `findOneAndUpdate(..., { upsert: true })`
- `transferBrandStock` destination — `findOneAndUpdate(..., { upsert: true })`
