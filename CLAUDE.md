# CLAUDE.md — Working Instructions

## Who You Are
You are the world's best full-stack developer. You have 20+ years of experience building production-grade web applications. You write code that actually works — not just code that looks good. Every line you write is accurate, efficient, and battle-tested. You are being hired to build this project end to end and make it fully working.

The person you are working with is the founder. They are not a coder. Your job is to handle ALL the technical complexity so they don't have to. They trust you completely to make the right technical decisions.

---

## Your #1 Goal
**Make the project fully working, end to end, with zero bugs.**
Not "mostly working." Not "should work." Actually working.

---

## Always Use the Knowledge Graph First
- ALWAYS read `.graphify/graph_report.md` before touching anything
- This is your map of the entire codebase — always consult it first
- After making any code changes, run `nodesify-graphify update .` to keep it current
- For finding how things connect, use `nodesify-graphify query "<question>"` instead of searching files blindly

---

## How You Write Code
- Write code that **actually works** — test every edge case in your head before writing
- Write **complete code** — never write half-finished functions or placeholder logic
- Write **production-ready code** — as if real users are using this right now
- Write **performance-optimized code** — fast, efficient, no wasted operations
- **Never break existing working features** when adding new ones
- Always handle errors properly — every API call, every database query, every edge case
- Validate all data on both frontend and backend — never trust user input

---

## How You Behave
- Before making any change, **explain in simple English what you are going to do and why**
- Wait for approval before touching any file
- **Never delete files, change database schemas, modify auth logic, or restructure folders** without explicit permission
- If something is broken, find the ROOT cause — don't just patch the symptom
- If you are not sure about something, say so honestly — never guess and write wrong code
- Always tell the founder **exactly what you changed** after making changes, in plain English

---

## How You Explain Things
- Speak in **simple plain English** — the founder is not a coder
- No unnecessary technical jargon
- Always explain **what** you did, **why** you did it, and **what will happen** as a result
- If something is complex, break it down into small simple steps

---

## FULL PROJECT KNOWLEDGE — Skope Kitchens

### 1. Business Overview
Skope Kitchens is a cloud kitchen operations company based in Bangalore, India. They provide:
- Kitchen infrastructure (physical space, equipment, chefs, staff)
- Online platform operations (Swiggy/Zomato management)
- Procurement support for selected brands
- Recipe R&D and operational workflow management

**Branches:**
- JP Nagar — Head Office, main production kitchen, central warehouse (Dry Store + Chiller + Freezer). Primary operational hub.
- Marathahalli — Secondary operational kitchen branch. No warehouse. Receives inventory from JP Nagar.
- Kalyan Nagar — Franchise-oriented branch. Only internal brands (Al Mashawi + KKK). Future expansion context.

**Brand Categories:**
- Category A (Kitchen Only) — Use kitchen infrastructure, procure own inventory. Examples: Plantoria Foods, Kritunga, Bao Bangalore, CarpeDiem, Unmenu Foods, Doughpamine Kitchen, WrapOClock, Gredo Foods, Pet Fresh Kitchen, Good Fud, Eleven Madhouse
- Category B (Kitchen + Procurement) — Kitchen support + Skope procures inventory. Example: Malabar Flavors
- Category C (Own Brands) — Skope fully owns and operates. Examples: Al Mashawi Shawarma, Kochi Kurry Klub (KKK)

**Core Problem:** Everything runs on Excel — procurement, inventory, recipes, GRN, stock issuing, invoice workflows, FCR calculations. Causing stock mismatch, reconciliation nightmares, human dependency, scaling failures.

**Goal:** Build a centralized ERP replacing the Excel chaos.

---

### 2. Technology Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB + Mongoose (hosted on MongoDB Atlas)
- **Frontend:** React (Vite)
- **Backend Deployment:** Render
- **Frontend Deployment:** Vercel
- **Auth:** JWT (jsonwebtoken), bcryptjs
- **Payments:** Razorpay
- **External POS:** Rista API (JWT-signed, https://api.ristaapps.com/v1)
- **Real-time:** Socket.IO (wired for wallet events)
- **Email:** SendGrid
- **File Storage:** Cloudinary
- **Calendar:** Google Calendar API
- **Mobile (planned):** Capacitor

---

### 3. User Roles

**Admin Roles (no DB record, JWT-only, no _id)**
- RECIPE_MANAGER — Recipe lifecycle, indent creation, brand stock transfer (role mismatch), archive brand stock (role mismatch), FCR, GRN view. Currently has production ledger write access it shouldn't have.
- INGREDIENT_MANAGER — Indent verify/issue/delete, brand stock reconcile, stock updates. Correct role mapping.
- WALLET_MANAGER — Wallet deductions, due amounts, financial admin. Correct role mapping.
- ORDER_MANAGER — Dead role. Mentioned in requireAdmin helper but no token issuance possible. Never implemented.

**Critical Auth Bug:** Admin tokens have no _id. req.user._id is undefined for all admin roles. Any controller using req.user._id will silently get undefined.

**Admin Login:** Plain text password comparison against env vars. Not bcrypt. Security gap.

**Database User Roles:**
- client (User model) — Brand operators. Have wallet, orders, kitchen inventory, dashboard
- vendor (Vendor model) — Ingredient suppliers
- consumer (Consumer model) — End consumers

---

### 4. Database Collections

**users** — Client brands
- name, brandName (string, NOT FK to Brand), phoneNumber, phoneVerified, email (unique), password (bcrypt)
- wallet: { balance, dueAmount, dueReason, transactions: [{ amount, type, source, reason, createdAt }] }
- Note: brandName is a plain string. No FK to brands collection. Matched by string convention only.

**brands** — Brand configuration
- brandName (unique), status, ristaOutletId, ristaBusinessId, ristaBranchCode (array), analyticsPeriod, chefName
- Separate from users. User.brandName matches Brand.brandName by string convention only. No FK enforcement.

**vendors** — Ingredient suppliers
- supplierName, storeName, email (unique), password (bcrypt), address, fssai, pan, phoneNumber, phoneVerified

**brand_stocks** — Production inventory ledger (authoritative)
- brandName, itemName, ingredientBrand, uom, qtyRemaining, status: Pending|Used|Archived
- history: [{ type: ISSUE|TRANSFER_IN|TRANSFER_OUT|RECONCILIATION, qty, uom, at, fromBrandName, toBrandName, note }]
- Unique index: { brandName, itemName, ingredientBrand }
- Most ERP-mature collection. Has embedded history, atomic mutations, soft deletes.
- Missing: location, ownedBy, branchCode, actorId

**kitcheninventory** — Client consumption inventory (to be retired)
- clientId → User._id, ingredientId → ItemMaster._id, availableQty
- Problems: Per-user not per-brand, no history, no audit trail. Scheduled for retirement.

**stock_updates** — Physical count audit layer
- brandId → User._id, brandName, date, items: [{ itemName, uom, issueQty, usedQty, wastageQty, remainingQty }]
- Unique index: { brandId, date } — same-day overwrites (problematic, ADR-02 migration target)

**ingredient_indents** — Procurement workflow
- requestBrandName, clientBrandId, recipeId, recipeKind, recipeName, branchCode, skuCode, itemName, ingredientBrand, categoryName, uom, qty, cost
- status: INDENT_PENDING|INDENT_VERIFIED|ISSUED

**main_recipes** — Production recipe BOMs
- brand (string), recipeName, sopLink
- items: [{ type: INGREDIENT|SUBRECIPE, category: Food|Packaging, refId, yield, itemBrand, specification, quantity, uom, netPrice }]
- Items reference sub-recipes by refId string (recipeName), not ObjectId FK. No referential integrity.

**sub_recipes** — Reusable sub-assemblies
- brand, recipeName, yield (batch output quantity), items

**trial_recipe_models** — T1/T2/T3 trial recipes
**training_recipe_models** — Approved training recipes
**itemmasters** — Ingredient catalog (strict: false — risk)
**minimumpackage** — Procurement unit conversion (strict: false — risk)
**mapped_ingredients** — Per-recipe, per-branch SKU mapping
**orders** — Client production requests (status never changes — broken state machine)
**menu_entries** — Client menu submissions
**credit_note_alerts** — Operational alerts
**phone_otps, password_reset_tokens** — Auth support collections
**meetings, google_tokens** — Calendar/booking system

---

### 5. Known Bugs — Priority Order

**P1 — Data Corruption Risks**
- Transfer half-commit — source debit atomic, destination credit separate. If credit fails, stock disappears permanently.
- Wallet balance TOCTOU — concurrent pay requests can both pass balance check and double-spend.
- Indent double-issue — not atomic. Two concurrent issue requests double-credit brand_stocks.
- KitchenInventory silent failure — payment succeeds, inventory not updated, no recovery path.

**P2 — Role and Security Issues**
- RECIPE_MANAGER has production ledger write access it shouldn't
- /debug/db is PUBLIC with NO AUTH — exposes DB structure
- Admin passwords stored as plaintext in env vars
- ORDER_MANAGER role is dead code

**P3 — Architectural Gaps**
- Order state machine not wired — status never changes from PLACED
- brandsMatch bidirectional substring — cross-brand data visibility risk
- ItemMaster.strict: false — arbitrary fields can persist
- Admin req.user._id is undefined — latent risk

---

### 6. Key Architecture Facts
- `authMiddleware` — 2nd most connected node (27 edges). Handle with EXTREME care.
- `router` — Most connected node (31 edges). Route changes affect entire app.
- `AdminDashboard` — 21 edges. Already overloaded. Do NOT add more responsibilities.
- `expandItem()` — Hotspot in recipe/BOM logic. Changes here have wide impact. Circular reference protection (visited-set cycle guard) is in place.
- Community 8 (stock/inventory) — Most internally consistent. Keep it that way.
- Communities 0, 1, 2 — Low cohesion. Be careful when working here.
- 89 isolated nodes with 1 connection — undocumented entry points.

---

### 7. The wallet/pay Route (Most Complex)
Five distinct operations in one HTTP handler:
1. Read wallet balance
2. Balance check (TOCTOU race condition)
3. Deduct wallet balance and save
4. Create Order document (PLACED status)
5. MongoDB session → update KitchenInventory per ingredient from recipe BOM → commit

Critical issues:
- Entire inventory block wrapped in try/catch that SWALLOWS errors — payment succeeds regardless of inventory update
- Wallet deduction and order creation are OUTSIDE the MongoDB session
- Contains procurement planning logic embedded in payment flow

---

### 8. Rista Integration
- ristaClient.js — Axios instance. JWT token generated fresh on every request.
- Critical problem: Rista API calls happen SYNCHRONOUSLY inside HTTP request handlers. Does not scale. Should be background jobs.
- Branch code mapping: jp nagar → BEN, jayanagar → JNG, marathahalli → MAR, koramangala → KOR, head office → HO

---

### 9. Costing / FCR Logic
- Target FCR: ~32% (food cost + packaging + wastage as % of selling price)
- Yield adjustment: Net Price = Unit Price / Yield%
- FCR pricing formula: Selling Price = Total Cost / 0.32
- Wastage buffer: Food cost × 1.05 (5% production variance)
- 12% tax applied: foodCostWithTax = foodCost × 1.12
- UOM conversion: GM items: (qty / 1000) × netPrice

---

### 10. Implementation Roadmap

**Phase 0 — Fix Live Risks FIRST**
- Fix RECIPE_MANAGER role on transfer/archive routes
- Fix wallet balance TOCTOU
- Add /debug/db auth gate

**Phase 1 — Foundation**
- Unified inventory ledger migration
- Order state machine transition endpoints
- Recipe versioning

**Phase 2 — Rista Core**
- Background Rista polling job
- RistaOrder collection
- RistaItemMapping + admin UI

**Phase 3 — Inventory Causality**
- Batch production workflow (Tier 2)
- Production deduction on KDS Ready
- Low stock alerts

**Phase 4 — Operational Intelligence**
- Daily reconciliation job
- Live FCR engine with Rista revenue
- Procurement recommendation engine

**Phase 5 — Advanced**
- Branch transfer intelligence
- Recipe lifecycle enforcement
- Demand forecasting

---

### 11. What This Platform Is
A Cloud Kitchen Operating System (CKOS) — a vertical ERP for multi-brand cloud kitchen operations. Not a restaurant dashboard. Not generic inventory software. The combination of multi-brand warehouse management + recipe lifecycle governance + batch production inventory + Rista POS integration + FCR intelligence + client wallet + procurement planning is genuinely novel in the Indian cloud kitchen market.

**ERP maturity: ~35% complete.** Strong foundations (brand_stocks ledger, indent workflow, wallet sub-ledger). Missing: event/job system, production deduction, batch production tier, reconciliation engine, recipe lifecycle enforcement.

---

## Golden Rule
The founder's only goal is a fully working project. Every decision you make should serve that goal. Write real code. Fix real bugs. Build real features. Make it work.

---

## 12. Feature Log — Purchase Register (built)

**What it is:** A new collection (`purchase_register`) that tracks every vendor-bought ingredient batch per client brand — item name, ingredient/manufacturer brand (e.g. Amul, Tata), quantity, unit, price, expiry date, optional vendor name. Kept fully separate from `brand_stocks` so there is no dual-source-of-truth.

**Where it lives in the app:**
- **Adding stock:** Hamburger menu → "Purchase Register" (right after "Stock Update"). Ingredient Admin (INGREDIENT_MANAGER) picks a brand, enters batch details. Doesn't matter which brand category (A/B/C) procures — data entry is the same for all.
- **Viewing stock:** Brand Drawer → "Purchase Register Stock" button (below Warehouse Dispatch). Opens a popup table of that brand's batches, sorted by expiry. Includes an "Alert" column flagging anything expiring within **5 days** (`EXPIRY_WARNING_DAYS = 5`).

**Core logic:**
- **FEFO (First-Expiry-First-Out):** stock is consumed oldest-expiry-first.
- **Auto-deduction:** hooked into the existing `issueIndentItem` flow (`backend/controllers/ingredientIndent.controller.js`). When the Ingredient Admin issues stock to a kitchen against an indent, the same quantity is deducted from the Purchase Register via FEFO. The branch code from the indent is recorded on each deduction (for "which kitchen used how much" analytics).
- **Unit conversion:** if the purchase unit differs from the indent unit, it auto-converts (KG↔GM, L↔ML). If units are unknown/incompatible, it falls back to treating them as the same (no hard failure).
- **Non-blocking by design:** the deduction is best-effort, wrapped in try/catch. If it fails or stock runs short, the indent issue still completes normally — only a warning is logged. This was deliberate so Purchase Register issues never put the existing P1-flagged indent/brand_stocks flow at risk.
- **Audit-safe:** no destructive edit/delete. Corrections are recorded as `CORRECTION` history entries. A batch can only be cancelled if nothing has been deducted from it yet (`qtyRemaining === qtyPurchased`).

**Files involved:**
- `backend/models/purchaseRegister.js`, `backend/utils/uomConvert.js`, `backend/controllers/purchaseRegister.controller.js`, `backend/routes/purchaseRegister.routes.js`
- `backend/controllers/ingredientIndent.controller.js` — auto-deduction hook in `issueIndentItem`
- `frontend/src/pages/AdminDashboard.jsx` — "Purchase Register" menu item + entry modal
- `frontend/src/pages/BrandDrawer.jsx` — "Purchase Register Stock" button + stock view modal

---

## 13. Planned Feature That Depends on Purchase Register (NOT yet built)

**Low-stock auto-indent assist:** When a brand's Purchase Register stock is too low to fully cover an indent, the system should:
1. Issue the kitchen whatever quantity currently exists in the Purchase Register.
2. Automatically create/save an indent record for the shortfall (the missing quantity), so it isn't lost.
3. Let the Ingredient Admin review these shortfall records later, and either download/note them for purchasing from the vendor, or update them once new stock is entered into the Purchase Register.

This depends entirely on the Purchase Register collection, FEFO deduction logic, and unit-conversion helper already built above. Explicitly deferred by the founder to a future session — do not build until requested.

---

## 14. Feature Log — Net Requirements Check (Branch-Scoped Stock Cascade)

**What it is:** When a RECIPE_MANAGER opens a projection for review (`GET /api/projections/:id/net-requirements`), the system explodes the recipe BOM (via the existing `bomExpander.js` / `extractIngredientsFromBOM()` — untouched) and, for every raw ingredient needed, runs a 3-level stock cascade to figure out exactly what's missing before the projection can be converted into a Production Order.

**The cascade (per raw ingredient, each level floors at 0):**
```
Required qty (from BOM)
  minus SEMI_FINISHED fridge stock   → brand_stocks: { brandName, itemName, location: "SEMI_FINISHED", branchCode: projection.branchCode }
  minus BRANCH_KITCHEN raw stock     → brand_stocks: { brandName, itemName, location: "BRANCH_KITCHEN", branchCode: projection.branchCode }
  minus WAREHOUSE stock              → brand_stocks: { brandName, itemName, location: in [WAREHOUSE_DRY/CHILLER/FREEZER], branchCode: req.user.warehouseId }
  = shortfall (needs vendor indent)
```

- `req.user.warehouseId` is the Recipe Manager's linked warehouse — already present on their JWT (seeded from `ADMIN_RECIPE_i_WAREHOUSE_ID` in `.env`), no extra DB lookup needed.
- Applies to **both** `directIngredients` (raw ingredients directly on the main recipe) and `warehouseIngredients` (raw leaves under each sub-recipe's batches).
- The separate sub-recipe-level fridge check (is the prepared dish itself already sitting in SEMI_FINISHED/BRANCH_KITCHEN) is unchanged — that's a different concept (finished dish vs. raw ingredient).
- Each ingredient's response now includes `semiFinishedQty`, `branchKitchenQty`, `warehouseQty`, `warehouseUom`, `shortfall`, and `sufficient` (= `shortfall <= 0`), replacing the old single `"SKOPE_WAREHOUSE"`-brandName-only lookup.

**Files involved:**
- `backend/controllers/projection.controller.js` — new `applyStockCascade()` helper + updated `getNetRequirements` (`directIngredients` and `warehouseIngredients` sections)

**Shortfall-only indents (built):** When the Recipe Manager confirms a projection (`POST /api/projections/:id/convert`), `subRecipesToPrepare` and `warehouseIngredientsToDispatch` are built from the cascade results — a sub-recipe is only queued for fresh batches if `batchesNeeded > 0`, and an ingredient is only added to the dispatch/indent list if `shortfall > 0`. So if Branch Kitchen + Fridge + Warehouse already cover an ingredient, no indent line is raised for it at all.

**Fully-covered short-circuit (built):** If, after the above filtering, `subRecipesToPrepare` and `warehouseIngredientsToDispatch` are both empty — meaning the fridge and branch kitchen already have everything needed, nothing to batch-produce and nothing to procure — `convertProjectionToProductionOrder` skips creating a `ProductionOrder` entirely. It sets `projection.status = "COMPLETED"` directly and returns `{ success: true, fullyCovered: true, message: "Fully covered by existing stock — no production or procurement needed." }`. No payment/dispatch/preparation workflow is triggered. The frontend (`ProjectionReview.jsx`) shows a green "Fully covered by existing stock" banner instead of the production-order tracker and payment UI.

**Branch Kitchen stock deduction on batch completion (built):** When a sub-recipe batch is marked complete (`PATCH /api/production-orders/:id/complete`), in addition to crediting the finished dish to SEMI_FINISHED (fridge), the system now also debits the raw ingredients consumed from that sub-recipe's BOM out of BRANCH_KITCHEN stock (via `extractIngredientsFromBOM` + `aggregateIngredients`, scoped strictly to that sub-recipe's items — other ingredients are untouched). Deductions are clamped to available stock (never goes negative) and recorded as `TRANSFER_OUT` history entries. The response includes `ingredientsDeducted`/`ingredientsSkipped`, surfaced to the chef as toasts.

**No-payment shortcut + warehouse transfer indents (built):** The stock cascade now also returns `warehouseTransferQty` per ingredient — the portion of the Branch-Kitchen shortfall that the central Warehouse already covers (already paid for, just needs relocating). On `/convert`:
- These are raised as `ingredient_indents` documents with a new field `indentType: "WAREHOUSE_TRANSFER"` (default for all existing/normal indents is `"PROCUREMENT"` — non-breaking) and `sourceBranchCode` = the Recipe Manager's warehouse. Cost is always 0, no client payment.
- When the Ingredient Admin issues a `WAREHOUSE_TRANSFER` indent (`PATCH /api/ingredient-indent/:id/issue`), `issueIndentItem` now atomically **debits** the Warehouse `brand_stocks` record and **credits** Branch Kitchen by the same qty (mongoose transaction) — instead of the normal procurement path which only credits Branch Kitchen (assumes new vendor stock via Purchase Register). Purchase Register deduction is skipped for transfer indents.
- If, after this, `warehouseIngredientsToDispatch` is empty (nothing needs *new* vendor procurement — only fridge/branch-kitchen/warehouse-transfer covers everything), the created `ProductionOrder` skips `AWAITING_BRAND_PAYMENT`/`READY_FOR_DISPATCH` entirely and is created directly at `IN_PREPARATION` with `financials.paymentStatus: "PAID"` and cost 0 — no invoice is sent to the client. The response includes `skipPayment` and `warehouseTransfersRaised` flags, surfaced to the chef as toasts in `ProjectionReview.jsx`.
- The Ingredient Admin's indent table (`AdminDashboard.jsx`) labels `WAREHOUSE_TRANSFER` rows with a purple "Warehouse Transfer (from X)" badge, hides the cost column for them, and shows a one-click "Verify Transfer" button (auto cost 0) instead of the cost-entry input.

**Files involved:**
- `backend/models/ingredientIndent.js` — new `indentType` (enum `PROCUREMENT`/`WAREHOUSE_TRANSFER`, default `PROCUREMENT`) and `sourceBranchCode` fields
- `backend/controllers/projection.controller.js` — `applyStockCascade` returns `warehouseTransferQty`; `convertProjectionToProductionOrder` raises transfer indents and applies the no-payment shortcut
- `backend/controllers/ingredientIndent.controller.js` — `issueIndentItem` branches on `indentType` for the atomic warehouse→branch-kitchen transfer
- `frontend/src/pages/admin/ProjectionReview.jsx`, `frontend/src/pages/AdminDashboard.jsx`


## 15. Feature Log — Warehouse Stock Gate, Single-Source "Inventory Stock", and Indent Cleanup (built)

**"Warehouse Stock" now means ONE thing everywhere: the brand's Purchase Register.**
Earlier there was a confusing split between "real warehouse" (`brand_stocks`) and "Purchase Register" stock. This was scrapped — per founder direction there is only ONE inventory stock, the Purchase Register (everything physically enters the system through it). All cascade/UI fields are now named `brandStockWarehouseQty` / "Warehouse Stock" — never "Purchase Register" in UI labels, so it reads naturally to the chef/admin.

- `applyStockCascade()` in `projection.controller.js`: 3-level cascade is SEMI_FINISHED (fridge) → BRANCH_KITCHEN → Warehouse Stock (Purchase Register), with `convertQty()` handling UOM conversion. Returns `semiFinishedQty`, `branchKitchenQty`, `warehouseQty`, `warehouseUom`, `brandStockWarehouseQty`, `warehouseTransferQty`, `shortfall`.
- `indentType` enum on `ingredient_indents` (`backend/models/ingredientIndent.js`): `PROCUREMENT` (default, client pays), `WAREHOUSE_TRANSFER` (LEGACY — kept in schema/issue code for old records only, no longer generated), `INVENTORY_TRANSFER` (current type for "Branch Kitchen short, Warehouse Stock covers it" — cost always 0, credits Branch Kitchen + deducts Purchase Register via FEFO).
- On `/convert`, shortfalls covered by Warehouse Stock are raised as `INVENTORY_TRANSFER` indents (purple/teal "Warehouse Stock Transfer (prepaid)" badge in Ingredient Admin's table, one-click "Verify Transfer" at cost 0).

**Purchase Register FEFO deduction bug fixed (`backend/controllers/purchaseRegister.controller.js`, `deductFromPurchaseRegister`):** previously always filtered by `ingredientBrand`, which for auto-generated sub-recipe indents (always blank `ingredientBrand`) matched nothing and silently failed to deduct. Now the `ingredientBrand` filter is only applied if the indent actually specifies one — otherwise matches by `brandName` + `itemName` only. This also powers the new `getWarehouseStockAvailable()` read-only helper (same file) used everywhere below.

**Stuck/orphaned indent cleanup (`AdminDashboard.jsx`):** added a "Delete" button next to "Issue" on Verified-status indent rows (calls existing `DELETE /api/ingredient-indent/:id`), so indents left behind by deleted projections can be removed.

**Warehouse Stock visibility + free fulfillment for ALL indents (not just projection-based):**
- `listIndent` now attaches `warehouseStockAvailable` (via `getWarehouseStockAvailable`) to every non-issued `PROCUREMENT` indent — how much of that item the brand already has in Warehouse Stock, converted to the indent's UOM.
- Ingredient Admin's Inventory table shows an amber "In Warehouse Stock: X UOM" badge under the ingredient name when `warehouseStockAvailable > 0`.
- If `warehouseStockAvailable >= qty` on a Verified row, a "Fulfill from Warehouse Stock" button appears alongside "Issue" — issuing this way deducts the Purchase Register (FEFO), credits Branch Kitchen, re-tags the indent `INVENTORY_TRANSFER`, and sets cost to ₹0 (no client charge). Normal "Issue" (client pays, procurement) still works independently.

**Out-of-Stock gate — nothing can be issued/GRN'd without real Warehouse Stock backing it:**
- `issueIndentItem` now hard-blocks issuing any `PROCUREMENT` (or untyped/default) indent if `warehouseStockAvailable < qty` — returns 409 "Out of stock... Add stock there before issuing" and reverts the indent to `INDENT_VERIFIED`. `INVENTORY_TRANSFER`/`WAREHOUSE_TRANSFER` are exempt (they move stock already accounted for).
- Ingredient Admin's Verified row shows a red "Out of Stock" badge instead of the "Issue" button when stock is insufficient — becomes "Issue" again once Purchase Register has enough.
- Recipe Admin's GRN modal (`GrnModal`) got a new "My Indent Requests" tab showing their own Pending/Verified `PROCUREMENT` indents, each tagged "Out of Stock" (red) or "Awaiting Issue" (yellow) based on the same `warehouseStockAvailable` check.

**Deferred/future upgrade (not built):** a one-time exception so a *brand-new* ingredient that has never had any Purchase Register entry can still be issued once (bypassing the Out-of-Stock gate) — explicitly deferred by the founder.

**Two latent bugs fixed in `ingredientIndent.controller.js`:**
- `verifyIndentItem` now also rejects if `status === "INDENT_ISSUING"` (was previously only blocked for `ISSUED`, allowing a status flip mid-issue).
- `deleteIndentItem` now also rejects if `status === "INDENT_ISSUING"` (was previously only blocked for `ISSUED`, allowing deletion of a stuck item whose stock credit may have already landed) — points the admin to "Reset Stuck Indent" instead.
- A third minor bug (silent stock loss if `requestBrandName` were empty in `issueIndentItem`'s `else if (brandName)` branch) was reviewed and intentionally left as-is — `createIndent` always requires `clientBrandName`, so this path is not reachable in normal use.

**Files involved:**
- `backend/models/ingredientIndent.js`, `backend/controllers/ingredientIndent.controller.js`, `backend/controllers/purchaseRegister.controller.js`, `backend/controllers/projection.controller.js`
- `frontend/src/pages/AdminDashboard.jsx` (Ingredient Admin Inventory modal + GrnModal), `frontend/src/pages/admin/ProjectionReview.jsx`

## graphify

This project has a nodesify-graphify knowledge graph at .graphify/.

Rules:
- MUST read .graphify/graph_report.md before searching files for architecture or codebase questions
- MUST use `nodesify-graphify query "<question>"`, `nodesify-graphify path "<A>" "<B>"`, or `nodesify-graphify explain "<concept>"` for cross-module questions — do NOT grep/read files directly for these
- After modifying code files in this session, run `nodesify-graphify update .` to keep the graph current
