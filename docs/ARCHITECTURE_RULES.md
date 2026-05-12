# Skope Kitchens — Inventory Architecture Rules

> Source of truth for anyone touching brand_stocks, stock_updates, ingredientIndents, or kitcheninventory.
> Read this before writing any mutation that touches stock quantities.

---

## 1. Ledger Layers (never collapse these)

| Collection | Role | Mutability |
|---|---|---|
| `brand_stocks` | Live quantity ledger per brand per ingredient | Mutable via controlled ops only |
| `stock_updates` | Audit layer — physical counts logged by ops staff | Prior dates immutable; same-day upsert allowed |
| `kitcheninventory` | Client-facing inventory (separate concern) | Managed independently |
| `ingredientIndents` | Purchase/issue request workflow | Status-gated; ISSUED records are permanent |

These are four separate collections serving four separate purposes. Do not merge them, and do not use one as a proxy for another.

---

## 2. brand_stocks — the only authoritative quantity source

`brand_stocks` is the single source of truth for how much of each ingredient a brand currently holds.

**Allowed mutations:**
- `ISSUE` — indent issued, qty credited via `$inc` (atomic, in `issueIndentItem` before ISSUED status is saved)
- `TRANSFER_IN` / `TRANSFER_OUT` — inter-brand transfer, atomic debit+credit with balance guard
- `RECONCILIATION` — physical count override or automated sync delta
- `Archived` status — soft delete only; never hard-delete a brand_stocks document

**Prohibited:**
- No direct writes to `qtyRemaining` outside these four paths
- No hard delete (`findByIdAndDelete`) — use `$set: { status: "Archived" }`
- No write-back to external systems (Rista) based on brand_stocks values

Every mutation **must** push a history entry `{ type, qty, uom, at, ... }`.

---

## 3. ingredientIndents — status machine, no shortcuts

Valid transitions: `INDENT_PENDING` → `INDENT_VERIFIED` → `ISSUED`

**Rules:**
- `ISSUED` indents cannot be deleted. Return 409 with an explicit message. Raise a reversal instead.
- `ISSUED` status must only be persisted **after** the brand_stocks credit succeeds. If the BrandStock update fails, the outer catch returns 500 and the indent remains `INDENT_VERIFIED` — safe to retry.
- `verifyIndentItem` sets cost; `issueIndentItem` credits brand_stocks then sets status.
- Never skip the verified step to go directly to ISSUED.

---

## 4. Transfers — atomic debit required

The source debit and destination credit are **not** in a transaction. To prevent double-spend:

- Source debit uses `findOneAndUpdate` with `{ qtyRemaining: { $gte: quantity }, status: "Pending" }` as the filter. The update only applies if the balance check passes atomically.
- If `fromDoc` is null, a diagnostic read determines the specific error (insufficient qty vs. non-Pending status) for the client error message.
- Destination credit uses `upsert: true` — creates the brand_stocks record if the brand has never held this ingredient before.

Do not replace this pattern with a read-then-write. The filter guard is the concurrency safety.

---

## 5. Reconciliation

There are two distinct reconciliation paths:

- **Manual reconciliation** (`POST /api/brand-stock/:id/reconcile`): uses `$set: { qtyRemaining: newQty }`. Physical count wins unconditionally. History records `{ type: "RECONCILIATION", previousQty, newQty, note }`. Never use `$inc` here — that compounds measurement errors.
- **Automated sync** (`stockUpdate.controller.js` after a stock_update save): uses `$inc` delta (`newQty - previousQty`) so concurrent writes from other sources are not clobbered. This is best-effort — failures are logged but do not block the stock_update response.

If `previousQty === newQty` on manual reconciliation, return early with `unchanged: true` — do not write a no-op history entry.

---

## 6. stock_updates — audit layer, not a ledger

`stock_updates` records physical counts taken by ops staff at a point in time.

- Stock update records for prior dates are immutable — do not update or delete them.
- Same-day upsert overwrite is currently allowed operational behavior (the controller finds-and-replaces the record for the same brandId + date combination). This is an acknowledged design choice, not a bug.
- Treat the collection as an append-only audit log for all historical dates.
- When a stock_update is saved, a best-effort sync updates `brand_stocks` via `$inc` delta. Sync failures are logged; they do not invalidate the stock_update record.
- `remainingQty` in stock_updates is a measured physical count — the sync uses it to reconcile brand_stocks, not to replace it unconditionally.

---

## 7. Recipe system — expansion and costing

Sub-recipe expansion uses a recursive BOM walk. Two invariants must hold:

- **Yield-aware scaling**: when a sub-recipe is referenced with `qty` grams, scale its ingredient quantities by `qty / batchYield`. If `batchYield` is 0 or missing, treat `scaleFactor = qty` (safe fallback, flagged in logs).
- **Circular reference protection**: maintain a `visited: Set<string>` across the recursion. Add the sub-recipe ID before recursing, delete it after (backtracking). If a sub-recipe ID is already in `visited`, skip it with a warning — do not recurse.

Never remove the visited Set. Circular references exist in production data.

---

## 8. Rista Integration Boundary

Rista is an external operational integration — this system treats it as a read-only data boundary. Never write back to Rista from this system.

Note: the Rista integration is not fully available yet; routes and utilities exist but live data may not be reachable in all environments. `brand_stocks` remains the authoritative source for internal stock levels; Rista data is intended to feed analytics only once the integration is live.

---

## 9. Role gates

| Operation | Required role |
|---|---|
| Create / verify / issue indents | `INGREDIENT_MANAGER` |
| GRN view (ISSUED indents) | `RECIPE_MANAGER` |
| Transfer brand stock | `INGREDIENT_MANAGER` |
| Reconcile brand stock | `INGREDIENT_MANAGER` |
| Stock updates (ops log) | `INGREDIENT_MANAGER` |
| Wallet / credits | `WALLET_MANAGER` |

Roles are checked via `requireRole(...)` middleware. Never expose mutation endpoints without a role gate.

---

## 10. What NOT to do

- Do not add a `remainingQty` field to `brand_stocks` — use `qtyRemaining`.
- Do not compute live stock by summing stock_updates — query `brand_stocks` directly.
- Do not hard-delete any ledger document (brand_stocks, ingredientIndents, stock_updates).
- Do not add `$inc` to manual reconciliation — physical count must win absolutely.
- Do not swallow errors in the issue flow with an inner try/catch — let failures propagate so the indent stays retryable.
- Do not write to Rista.
