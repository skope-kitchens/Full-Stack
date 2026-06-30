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

**Branches (B2C base → local model):**
- JP Nagar — Head Office + **base kitchen** + central warehouse (Dry Store + Chiller + Freezer). Vendor procurement and centralized **sub-recipe production** happen here. Trials & training also happen here. Primary operational hub.
- Marathahalli — **local / normal kitchen**. No warehouse. Receives prepared sub-recipes from the base kitchen and does final assembly only. (Live-operations phase.)
- Jayanagar — **local / normal kitchen**, internal brands (Al Mashawi + KKK). Future expansion context. (Live-operations phase.) (Renamed from "Kalyan Nagar" — branchCode `JAYANAGAR`; see §27.)
- Note: "Head Office" is just a UI label for JP Nagar — same entity, no separate backend branch, no pipeline/architecture impact.

**Brand Categories:**
- Category A (Kitchen Only) — Use kitchen infrastructure, procure own inventory. Examples: Plantoria Foods, Kritunga, Bao Bangalore, CarpeDiem, Unmenu Foods, Doughpamine Kitchen, WrapOClock, Gredo Foods, Pet Fresh Kitchen, Good Fud, Eleven Madhouse
- Category B (Kitchen + Procurement) — Kitchen support + Skope procures inventory. Example: Malabar Flavors
- Category C (Own Brands) — Skope fully owns and operates. Examples: Al Mashawi Shawarma, Kochi Kurry Klub (KKK)

**Operating split (current direction):** A separate, Skope-internal **B2C / B2B** classification now drives the actual operating flow — see the "Operating Model" section below. B2B/B2C is the active distinction being built. The A/B/C categories above are legacy (who-procures) context and are dormant for now — do not build new logic on A/B/C.

**Core Problem:** Everything runs on Excel — procurement, inventory, recipes, GRN, stock issuing, invoice workflows, FCR calculations. Causing stock mismatch, reconciliation nightmares, human dependency, scaling failures.

**Goal:** Build a centralized ERP replacing the Excel chaos.

---

### Operating Model — B2C (Current Build) vs B2B (Planned) — READ THIS FIRST

> **Maintenance rule:** whenever a feature is **fully built and verified**, update THIS file (the relevant section + add/extend a Feature Log entry) **and** run `nodesify-graphify update .`. The doc and the knowledge graph must always reflect what is actually in the codebase — do not let them drift.

Every client brand is internally classified as **B2C** or **B2B**. This flag is **Skope-internal** — it is NEVER shown to the client and is NOT collected at signup. It lives as a field on the client/brand record, set and edited **only by a POC** (default: **B2C**). It does not replace the legacy A/B/C categories; A/B/C describe *who procures*, B2B/B2C describe *the operating flow*. Right now only **B2C** is being built.

**B2C — what we are building now:**
1. Skope procures raw ingredients from vendors. Procurement happens at the **base kitchen only**.
2. **Base kitchen = JP Nagar** (head office + central warehouse). The **Head Chef** runs it and prepares **sub-recipes in bulk**.
3. Prepared sub-recipes are shipped to the **local / normal kitchens**.
4. Local kitchens do **final assembly** of the customer dish only (fast, ~10 min). They do **not** procure from vendors and do **not** cook sub-recipes from raw.
5. Trials & training happen **only at the base kitchen (JP Nagar)**. Local kitchens belong to the later live-operations phase.

> This **inverts the earlier assumption** baked into some existing code and the older Feature Logs (§14–15), where every kitchen cooked its own sub-recipes from raw and pulled raw stock directly. Under B2C, sub-recipe **production is centralized at the base kitchen** and only **assembly** happens at local kitchens. Existing cascade/stock code still works for the base kitchen; extend it toward this model rather than assuming each kitchen is self-contained.

**B2B — planned, NOT built (do not build until explicitly requested):**
- The brand runs its **own sub-warehouse** and does its **own local procurement + dispatch**, bypassing the central base kitchen. Example brand: WrapOClock.
- Requires per-brand warehouse entities and brand-local procurement flows. Deferred until the B2C build is complete and stable.

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

### 3. User Roles & Dashboards

The system is being reorganized into **six role-scoped dashboards**. Some are new; others are re-scoped versions of the existing admin roles. The underlying **code roles** (`RECIPE_MANAGER`, `INGREDIENT_MANAGER`, etc.) still exist and continue to power the dashboards noted below — the dashboards are the product-level reframing, **not** a from-scratch auth rewrite.

**Auth status (corrected — supersedes older notes elsewhere in this file):** Admin users are now stored in the **`AdminUser` collection** with **bcrypt-hashed** passwords, and the JWT carries `_id`, `role`, `branchCode`, `warehouseId`, and `branchCodes`. The earlier "admins have no DB record / no `_id`" problem is **RESOLVED**. One cleanup remains: a legacy plain-text password fallback in `auth.controller.js` still needs removal before deployment.

**The six dashboards:**

1. **Client dashboard** — *foundation exists.* Brand operators (User model). Strictly **read-only EXCEPT**: submit menu, submit projections (gated until subscription is paid), and pay invoices via Razorpay/wallet. Stage-gated lifecycle: signup (name, company, email, mobile) → menu enabled → **menu submission triggers trials/training** → subscription invoice (sent by POC) paid into wallet → POC sets go-live on Swiggy/Zomato → **sales/order data + projection submission unlock**. The full dashboard shell is visible from first login but empty until data exists. Client CANNOT input stock, FCR, SOP, task statuses, or go-live status, and never sees the B2B/B2C flag.

2. **POC dashboard** — *new build.* Skope-side. **Two POCs share ONE dashboard** and manage **every** client from it. POCs input ALL operational data the client sees: FCR, daily stock (during trial/training), SOP, and task statuses (pending/completed — e.g. vendor sourcing, store branding, operation setup). They send the subscription invoice, set the go-live status, and set each client's internal **B2B/B2C** flag. **HARD REQUIREMENT:** a single standardized entry format/template (not free text) so what the client sees is consistent across both POCs.

3. **Stock Manager dashboard (base kitchen)** — *re-scoped from the Ingredient Admin (`INGREDIENT_MANAGER`).* Lives at the base kitchen (JP Nagar). Owns vendor procurement, warehouse stock, indents, GRN, the new **Delivery QC gate**, and (post-trial) daily stock updates at the main kitchen.

4. **Head Chef dashboard (base kitchen)** — *modified from the Recipe Admin (`RECIPE_MANAGER`).* Lives at the base kitchen (JP Nagar). Owns recipes/BOM, trials & training, projections (input enabled post-subscription), and **centralized sub-recipe production**.

5. **Local Kitchen dashboard** — *new build; borrows from both Recipe + Ingredient admin.* For normal/local kitchens in the live-ops phase. Receives sub-recipes from the base kitchen, handles final assembly, local stock, fridge audit, and daily stock updates for its own kitchen.

6. **Data Analyst dashboard** — *new build, done LAST.* Human analyst. Read-everything + manipulate across all roles: received-stock detail, Smart Plan outputs (orders brand-wise and kitchen-wise), closing-stock variance + financial-impact, FCR, order comparison. Built last because it **consumes** data the other dashboards must first **produce**. An automation engine for the analyst is acknowledged but is **NOT** a current priority.

**Build order:** Client → POC → (Stock Manager + Head Chef + Local Kitchen — the data producers) → Data Analyst → analyst engine (future).

**Data-emission note for producer dashboards (3/4/5):** each must emit the data the analyst will later read — e.g. the kitchen flow must log **realized consumption** (for realized FCR), and procurement must log **received-vs-ordered** (for variance). Build these hooks in as you go so the analyst dashboard isn't left with gaps.

**Audit-storage rule (do NOT mix these up):** base-kitchen (Head Chef §21) and local-kitchen (Local Kitchen §22) closing-stock audits write to the **`producer_audits`** collection (keyed `{brandId, branchCode, scope, date, correctionSeq}`), **NOT** `stock_updates`. `stock_updates` remains exclusive to the client's brand-wide Daily Stock view (+ the Stock Manager warehouse audit) — its key isn't branch/scope-aware, so reusing it for producer audits would collide and corrupt Daily Stock.

**Other roles (unchanged):**
- `WALLET_MANAGER` — wallet deductions, due amounts, financial admin. Correct mapping.
- `ORDER_MANAGER` — dead role, never implemented (no token issuance possible). Leave as-is or remove during cleanup.

**Database user roles:**
- **client** (User model) — Brand operators. Have wallet, orders, kitchen inventory, dashboard.
- **vendor** (Vendor model) — Ingredient suppliers.
- **consumer** (Consumer model) — End consumers.

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
- Now ALSO has: location (SEMI_FINISHED | BRANCH_KITCHEN | WAREHOUSE_DRY|CHILLER|FREEZER), ownedBy, branchCode, qtyReserved
- history: [{ type: ISSUE|TRANSFER_IN|TRANSFER_OUT|RECONCILIATION, qty, uom, at, fromBrandName, toBrandName, note }]
- Unique index (current): { brandName, itemName, ingredientBrand, location, branchCode } — each item tracked separately per location per branch. (The older { brandName, itemName, ingredientBrand } index is superseded.) See Feature Logs §14–15.
- Most ERP-mature collection. Has embedded history, atomic mutations, soft deletes.
- (actorId still not added.)

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
- Indent double-issue — not atomic. Two concurrent issue requests double-credit brand_stocks. **[RESOLVED — atomic findOneAndUpdate with status guard; see Feature Log §15]**
- KitchenInventory silent failure — payment succeeds, inventory not updated, no recovery path.

**P2 — Role and Security Issues**
- RECIPE_MANAGER has production ledger write access it shouldn't
- /debug/db is PUBLIC with NO AUTH — exposes DB structure
- Admin passwords stored as plaintext in env vars **[PARTIALLY RESOLVED — bcrypt is now primary via the AdminUser collection; a legacy plain-text fallback in auth.controller.js still needs removal before deployment]**
- ORDER_MANAGER role is dead code

**P3 — Architectural Gaps**
- Order state machine not wired — status never changes from PLACED
- brandsMatch bidirectional substring — cross-brand data visibility risk
- ItemMaster.strict: false — arbitrary fields can persist
- Admin req.user._id is undefined — latent risk **[RESOLVED — admins now stored in AdminUser collection with _id carried on the JWT]**

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

**Direction:** Build the six dashboards in order (see "User Roles & Dashboards"), **B2C only**. Borrow specific proven features from the **Swanky** single-brand reference app, adapted to Skope's multi-brand, multi-kitchen, **dish/menu** model.

**Pre-deployment fixes (do first — security / data-safety):**
- Add `/debug/db` auth gate (currently public, no auth).
- Remove the legacy plain-text admin password fallback in `auth.controller.js`.
- Wallet balance TOCTOU fix (concurrent pay double-spend) — required when the wallet is wired to production payment.

**Dashboard build sequence:**
1. **Client dashboard** — ✅ **BUILT (B2C)** — see Feature Log §16. Stage-gated lifecycle (AWAITING_MENU→IN_TRIAL→LIVE), drawer layout, menu + gated-projection input, read-only views, wallet + invoice payment (onboarding/procurement/subscription via `/api/client/invoices/:id/pay`; production via existing production-order pay). Onboarding tasks reuse `BrandServiceChecklist`. TEMP POC writers stand in until the POC dashboard exists.
2. **POC dashboard** — ✅ **BUILT (B2C)** — see Feature Log §17. Client list (search/stage filter, onboarding %), per-client workspace, brand-scoped + phase-scoped FCR price entry, daily stock, SOP links, procurement mode + ingredient list, branch assignment, trigger-only invoicing, view-only menu/projections, clientType flag + go-live. The TEMP admin invoice/go-live writers were migrated here and deleted.
3. **Producer dashboards** — Stock Manager, Head Chef, Local Kitchen — including the data-emission hooks the analyst will read.
   - **Stock Manager** — ✅ **BUILT (B2C)** — see Feature Log §20. New `/stock-manager` route (INGREDIENT_MANAGER, the same code role, now reframed as Stock Manager). Brand-picker home + per-brand workspace (Stock Overview, incoming Indents, GRN+Delivery QC, Purchases Log, Closing Stock Audit with lock + stacked corrections, Reorder Insights) + global Vendors. New `procurement_logs` collection is the Data Analyst's primary read source — every write path emits one entry. Ingredient-Admin views migrated out of `AdminDashboard.jsx` (preserved as `AdminDashboard.legacy.jsx`).
   - **Head Chef** — ✅ **BUILT (B2C)** — see Feature Log §21. New `/head-chef` route (RECIPE_MANAGER). Built ALONGSIDE the legacy `AdminDashboard.jsx` (NOT a migration/removal) — the recipe editor stays reachable via an "Open Recipe Editor" link. **Recipe editing still lives in AdminDashboard:** `/head-chef`'s Recipes/Trials/Training tabs are navigation entry points (links to `/add-recipe`/`/add-trial-recipe`/`/add-training-recipe` for creation; AdminDashboard modals for editing existing BOMs), not native editors. **Follow-up flagged: a native recipe editor inside `/head-chef` is a PREREQUISITE for removing the legacy recipe-admin views from `AdminDashboard.jsx`. Until that's built, the legacy AdminDashboard remains the recipe-editing surface and must NOT be removed.**
   - **Local Kitchen** — ✅ **BUILT (B2C)** — see Feature Log §22. New `LOCAL_KITCHEN` role + `/local-kitchen` route, one branch-scoped login per kitchen.
   - **Head Chef carry-forward (RESOLVED in §21):** the legacy "Stock (Rista)" POS-inventory lookup now lives on the Head Chef dashboard as **Stock (Rista) Reconciliation** (`GET /api/head-chef/rista-stock-comparison` — joins `ristaClient.getInventory` vs Purchase Register, graceful empty state when Rista isn't configured for a branch). Done.
4. **Data Analyst dashboard** — consumes the above.
5. **Analyst automation engine** — future.

**Swanky feature borrowings:**
- *Now:* procurement-from-vendor workflow; **Delivery QC gate** (planned vs purchased vs received, QC status before stock is credited); **Smart Plan pipeline** (forecast → shopping cart — adapt box→dish); **closing-stock variance + financial-impact** reporting; **realized-vs-theoretical FCR** (compare BOM-theoretical cost to actual consumption — the gap is yield leakage); **forecast-vs-actual order comparison**, wired into Smart Plan.
- *Later:* Telegram daily report / low-stock alerts; "Copy for WhatsApp" shopping cart; price governance (market-drift / margin-erosion).
- *Two constraints on ALL borrowings:* (a) Swanky is box-centric, Skope is dish/menu-centric — the math transfers, the "box" wrapper does not; (b) realized FCR requires real consumption logging through the cascade + fridge/spoilage audit (partially in place).

**Sequencing dependency:** Smart Plan, realized FCR, and order comparison all sit on top of the B2C base→local architecture and the role remap — settle those before building the analytics layer, or it becomes rework.

**Deferred (do NOT build until requested):** B2B operating flow (own sub-warehouse + local procurement); low-stock auto-indent assist; analyst automation engine; first-time-ingredient Out-of-Stock exception.

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

## 16. Feature Log — Client Dashboard (built, B2C)

**What it is:** The first of the six role-scoped dashboards (see "User Roles & Dashboards"). A fully re-laid-out, read-only-except-where-noted client/brand dashboard at `/dashboard`. The old client dashboard was preserved verbatim as `frontend/src/pages/Dashboard.legacy.jsx` (not routed) for rollback; the new shell replaced `Dashboard.jsx` in place.

**Layout:** Top-right Logout. Retractable left drawer (collapse/expand toggle) with, in order: Service Onboarding Status · Enter Projections (locked unless LIVE) · Daily Stock · Food Cost/FCR · Per Day Analytics · Analytics (Date Range) · Invoices · Wallet & Transactions · Profile. Each drawer item opens as its own in-shell page. HOME page (Menu lives here, not in the drawer): clickable wallet balance in the top bar → wallet modal; brand name + logo (click logo → change-logo popup); `<h1>` "Brand Dashboard"; a horizontal branch selector; and the Menu section as focal element (reuses the existing Enter-Menu popup + a read-back of the submitted menu for the selected branch). The "Meeting Time Left" tracker from the legacy dashboard was removed.

**Lifecycle (stage-gated):** `AWAITING_MENU` → (first menu submit) → `IN_TRIAL` → (POC go-live) → `LIVE`. Enforced on BOTH frontend (locked UI) and backend (403): Enter Projections + both Analytics views require `LIVE`. Menu submit and viewing onboarding/daily-stock/FCR/invoices/wallet/profile are available earlier.

**Schema additions (on the `User` model only):** `logoUrl`, `assignedBranches` (default `["JPNAGAR","TESTBRANCH"]`), `lifecycleStage` (enum AWAITING_MENU|IN_TRIAL|LIVE, default AWAITING_MENU), `invoices[]` (`{type: ONBOARDING|PROCUREMENT|SUBSCRIPTION|PRODUCTION, amount, status: UNPAID|PAID, branchCode, createdAt}`). Branch display names (`JPNAGAR`→"Main Kitchen", `TESTBRANCH`→"Test Branch") are a frontend/controller constant, not stored.

**Onboarding tasks — REUSED, not duplicated:** The 15 onboarding tasks already existed as `BrandServiceChecklist` + the `MASTER_SERVICES` list in `admin.brand.routes.js`, surfaced by `GET /api/services/client`. The client dashboard reuses this as the single source of truth — **no new `onboardingTasks` field was added** to the User (avoids dual source of truth). `GET /api/client/onboarding-status` returns `lifecycleStage` + the checklist mapped to `{taskName, status}`. The POC "onboarding-task writer" is the **existing** `PATCH /api/admin/services/:brandId` (no duplicate created).

**New backend — `/api/client` (controller `client.controller.js`, routes `client.routes.js`):** every endpoint requires `role === "client"`, scopes by the caller's own `brandName`, and validates `branchCode ∈ assignedBranches` (403 otherwise).
- `GET /profile`, `PATCH /logo` (pushes a pasted image URL through Cloudinary, stores secure_url)
- `GET /branches` (→ `[{branchCode, displayName}]`)
- `GET /onboarding-status`
- `GET /menu?branchCode=` (client reads back their OWN submitted menu — the existing list endpoint is admin-only, so this small read was added; submission still reuses `POST /api/menu-entries`)
- `GET /daily-stock?date=` (reads `stock_updates`; **brand-wide — see branch note**)
- `GET /fcr` (reuses the costing engine via new `computeBrandFcrSummary(brandName)` exported from `costing.controller.js`; **brand-wide**)
- `GET /analytics/daily?branchCode=&date=` and `GET /analytics/range?branchCode=&startDate=&endDate=` — **403 unless LIVE**, Rista-backed, branchCode→Rista code mapped (`JPNAGAR`→`BEN`, etc; unmapped branches fall back to the brand's configured Rista codes)
- `GET /invoices?branchCode=` (merges User.invoices + PRODUCTION invoices read from `production_orders` with cost > 0)
- `POST /invoices/:id/pay` (atomic, balance-safe wallet deduction + mark the manual invoice PAID via `arrayFilters`; PRODUCTION invoices are rejected here — paid via the existing production-order pay route)

**Branch-scoping note (important):** `stock_updates` (`{brandId, date}`) and FCR/recipes are NOT branch-scoped in their schemas, and those schemas were NOT changed. So **Daily Stock and FCR pages have NO branch dropdown** — they show a "Shown brand-wide (not branch-specific)" label instead. Menu, Projections, both Analytics, and Invoices ARE genuinely branch-scoped.

**Reused money flows (not re-implemented):** wallet balance/transactions (`GET /api/wallet`), recharge + Pay-Due (`/api/wallet/create-order` + `/verify`), production-invoice banner + pay (`/api/production-orders/my-pending`, `/:id/pay`). **GST:** `applyGst:true` is sent ONLY on the Pay-Due path; recharge (₹500/₹1000/custom) and the new `/api/client/invoices/:id/pay` apply NO GST.

**Lifecycle hooks added (additive) to existing controllers:**
- `menuEntry.controller.js createMenuEntry`: first successful submit flips `AWAITING_MENU → IN_TRIAL` (idempotent `updateOne` guarded on current stage; best-effort, never blocks the save).
- `projection.controller.js createProjection`: 403 unless `lifecycleStage === LIVE` (re-reads from DB).

**TEMP POC writers (in `admin.brand.routes.js`, WALLET_MANAGER-guarded, marked "temporary — replaced by POC dashboard"):** `POST /api/admin/client/:clientId/invoice` (raises an ONBOARDING/PROCUREMENT/SUBSCRIPTION invoice onto a client) and `PATCH /api/admin/client/:clientId/go-live` (sets `lifecycleStage: LIVE`). Go-live is intentionally NOT gated on "subscription paid" yet — the POC dashboard will own that later.

**Behavior-preserving refactor:** the per-day Rista brand summary inlined in `GET /api/analytics/sales/summary` was extracted verbatim into `backend/utils/salesSummary.js` (`computeBrandSalesSummary`). The analytics route and the new client analytics endpoints now share it; the existing route's output shape is unchanged.

**Files involved:**
- `backend/models/user.js` (schema additions), `backend/controllers/client.controller.js` (new), `backend/routes/client.routes.js` (new), `backend/utils/salesSummary.js` (new), `backend/controllers/costing.controller.js` (`computeBrandFcrSummary` export), `backend/routes/analytics.routes.js` (uses shared helper), `backend/controllers/menuEntry.controller.js` + `backend/controllers/projection.controller.js` (lifecycle hooks), `backend/routes/admin.brand.routes.js` (TEMP POC endpoints), `backend/index.js` (mounts `/api/client`)
- `frontend/src/pages/Dashboard.jsx` (new client shell), `frontend/src/pages/Dashboard.legacy.jsx` (verbatim rollback copy, not routed)

**Deferred (not built):** Data Analyst dashboard, realized FCR, and the analyst engine — per the build order. (POC dashboard is now BUILT — see §17.)

**Addendum — SOP Documents now visible to the client (read-only; built later):** The POC-entered `sopDocuments[]` (title + link, written via the unchanged `POST /api/poc/clients/:clientId/sop` — §17) used to be write-only. A read-only client view now exists: new `GET /api/client/sop` (`getSopDocuments` in `client.controller.js`, routed in `client.routes.js`) — `requireClient`-gated, scoped to `req.user._id` (no cross-brand leak), **NO lifecycle gate** (SOPs are an onboarding-phase deliverable, visible from `AWAITING_MENU` onward), returns `{ documents: [{title, link, updatedAt}] }` sorted newest-first (empty array, never 404, when none entered). Frontend: a new **"SOP Documents"** drawer item (right after "Service Onboarding Status") + read-only `SopView` in `Dashboard.jsx` (title + "Open SOP" link in a new tab; empty state "Your SOPs will appear here as your POC finalises them"). No add/edit/delete on the client side; the POC writer is untouched.

**Addendum — Procurement List (ingredient list + vendor prices) now visible to the client (read-only; built later; fixes a gap where the POC's "Generate & send ingredient list" had no client-facing surface at all).** `User.procurement.{trial,training}.ingredientList` items gained `unitPrice`/`totalPrice` (default null); each phase object gained `grandTotal`/`pricingStatus` (`AWAITING_PRICING`/`PRICED`). This is a THIRD, separate procurement-pricing mechanism from (1) FCR/recipe pricing (`postFcrItem`) and (2) the per-kitchen-list pricing on `ingredient_lists_to_poc` (§17 addendum below) — no shared code with either. `postProcurementList` (regenerate/send) now carries forward previously-entered prices for items that still match by name when rebuilding from the BOM, so re-sending after a recipe change doesn't silently wipe prices. New `PATCH /api/poc/clients/:clientId/procurement-list/prices` `{phase,items:[{itemName,unitPrice}]}` (POC side) — same case-insensitive-match-and-validate pattern as the kitchen-list pricing endpoint, recomputes `grandTotal`/`pricingStatus`. New `GET /api/client/procurement-list?phase=` (`getProcurementListClient`, `requireClient`-gated, scoped to `req.user._id`, **NO lifecycle gate** — same precedent as SOP/Daily Stock) returns `{phase,mode,listSentAt,items,grandTotal,pricingStatus}`; never fabricates data — `listSentAt:null` and empty `items` when nothing has been sent yet. Frontend: POC's existing read-only items table in `ProcurementView` (`PocDashboard.jsx`) gained an editable Unit Price column + live Total/Grand-Total + "Save Prices" button. Client side: new **"Procurement List"** drawer item (after "SOP Documents") + read-only `ProcurementListView` in `Dashboard.jsx` (phase toggle, item/qty/uom/price/total table, grand total, empty state "Your POC hasn't sent an ingredient list... yet"). No add/edit on the client side; no invoice-raising on this list (that stays exclusive to the §17 addendum's kitchen-list flow).

## 17. Feature Log — POC Dashboard (built, B2C)

**What it is:** The second of the six role-scoped dashboards. A Skope-internal POC (Point of Contact) tool at `/poc`. TWO POCs share ONE login and manage EVERY client from one dashboard (no per-POC client subsets). The POC owns the operational data the client views read-only.

**New role:** `POC` added to the `AdminUser.role` enum and to `authMiddleware`'s `ADMIN_ROLES` set. Seeded as ONE shared account from `ADMIN_POC_USERNAME`/`ADMIN_POC_PASSWORD` (bcrypt, same pattern as other admins) in `seedAdminUsers.js`. **Run `node backend/scripts/seedAdminUsers.js` once after deploy** so the shared POC login exists. JWT carries `adminId` + `role: "POC"`. All `/api/poc/*` routes are gated by `requireRole("POC")`.

**Money is FROZEN — untouched.** The POC renders NO wallet/balance/GST UI and contains NO money logic. Invoices are append-only UNPAID *records* on `User.invoices`; the existing frozen wallet flow settles them when the client pays. No wallet balance/dueAmount/GST/Razorpay code was touched or added.

**Schema additions (additive only):**
- `AdminUser.role` enum gains `"POC"`.
- `User`: `clientType` enum `["B2C","B2B"]` default `"B2C"` (internal, POC-set, NEVER returned by the client controller); `sopDocuments: [{ title, link, updatedAt }]` (links only); `procurement: { trial: { mode, ingredientList: [{itemName,uom,qty}], listSentAt }, training: { ... } }` where `mode` ∈ `["SKOPE_PROCURES","CLIENT_PROCURES"]`, default both `SKOPE_PROCURES`.
- Reuses existing client fields from §16 (`assignedBranches`, `lifecycleStage`, `invoices[]`, `logoUrl`) — no duplication.

**FCR price entry — BRAND-SCOPED + PHASE-SCOPED (the key correctness fix):** The client-visible FCR (`computeBrandFcrSummary → calculateRecipe → expandItem`) reads `netPrice` off `MainRecipe`/`SubRecipe` items only; the `trial_recipes`/`training_recipes` collections are separate and NOT read by it. So the POC price write (`POST /api/poc/clients/:clientId/fcr-item` `{ phase, refId, uom, unitPrice, yieldPercent }`) computes `netPrice = unitPrice / (yieldPercent/100)` (the §9 formula) and writes it to (a) the phase collection (`TrialRecipe`|`TrainingRecipe`) AND (b) the brand's `MainRecipe` + `SubRecipe` items — all filtered by an EXACT brand match (anchored case-insensitive regex), so another brand's FCR can never move. The global `bulkUpdateIngredientPrices` was deliberately NOT reused (it is cross-brand). `recipesUpdated: 0` simply means the Head Chef hasn't built recipes carrying that ingredient yet — not an error.

**Procurement path (gates WHEN a price is entered):** `PATCH .../procurement-mode` sets a phase to `SKOPE_PROCURES` or `CLIENT_PROCURES`. `POST .../procurement-list` generates the phase's ingredient list READ-ONLY from the brand's trial/training BOMs (reusing `extractIngredientsFromBOM` + `aggregateIngredients`), snapshots it, and marks it "sent". On `CLIENT_PROCURES`, `postFcrItem` is hard-blocked (409) until the list is sent — prices are entered only after the client purchases. On `SKOPE_PROCURES`, prices are entered directly and a `PROCUREMENT` invoice can be raised (trigger-only). If the brand has no trial/training recipes yet, the list is empty and is NOT marked sent — no fabricated data.

**Reused, not duplicated:** onboarding tasks = `BrandServiceChecklist` (the 15 `MASTER_SERVICES`, now extracted to shared `backend/utils/masterServices.js` and imported by both `admin.brand.routes.js` and the POC controller); daily stock = `stock_updates`/`StockUpdate` shape, brand-wide (no fake branch dropdown), writes only `stock_updates` (not the P1-sensitive `brand_stocks` ledger); menu = `menu_entries`; projections = existing `Projection` model `{ brandId }` query (no schema change); FCR summary = `computeBrandFcrSummary`.

**Future data sources:** `backend/services/pocData.service.js` is the seam where the POC's read views will later source LIVE data from the producer dashboards (Head Chef → production status; Stock Manager → warehouse/GRN/QC; Local Kitchen → local stock/fridge audit). Today each returns current POC-entered data or an explicit `NOT_AVAILABLE_YET` empty shape — clearly-marked `// FUTURE:` stubs, NO invented routes for unbuilt dashboards. Surfaced via `GET .../fcr-summary` and `.../producer-data`.

**TEMP-endpoint migration (cleanup of §16 scaffolding):** the temp `POST /api/admin/client/:clientId/invoice` and `PATCH /api/admin/client/:clientId/go-live` (WALLET_MANAGER-gated) were migrated to `POST /api/poc/clients/:clientId/invoice` and `PATCH /api/poc/clients/:clientId/go-live` (POC-gated) and **deleted** from `admin.brand.routes.js` — grep confirmed no frontend caller (the client dashboard uses its own `/api/client/...` routes). Go-live still carries a `// TODO: gate on subscription paid` comment (finance ownership unresolved/FROZEN).

**Endpoints (`/api/poc`, all POC-gated; each validates the clientId exists and branchCode ∈ assignedBranches):** `GET /clients` (`?search=&stage=`), `GET /clients/:id`, `GET/PATCH .../onboarding[-task]`, `GET/POST .../daily-stock`, `GET .../fcr-items` + `POST .../fcr-item` + `GET .../fcr-summary` + `GET .../producer-data`, `GET/POST .../sop`, `PATCH .../branches`, `POST/GET .../invoice[s]`, `PATCH .../procurement-mode` + `POST/GET .../procurement-list`, `GET .../menu` + `GET .../projections`, `PATCH .../client-type` + `PATCH .../go-live`.

**Files involved:**
- `backend/models/adminUser.js` (+POC enum), `backend/middleware/auth.js` (+POC in ADMIN_ROLES), `backend/scripts/seedAdminUsers.js` (+POC block), `backend/.env` (+`ADMIN_POC_*`), `backend/models/user.js` (+`clientType`, `sopDocuments`, `procurement`)
- `backend/controllers/poc.controller.js` (new), `backend/routes/poc.routes.js` (new), `backend/services/pocData.service.js` (new), `backend/utils/masterServices.js` (new, shared), `backend/index.js` (mounts `/api/poc`), `backend/routes/admin.brand.routes.js` (TEMP routes deleted; imports shared MASTER_SERVICES)
- `frontend/src/pages/PocDashboard.jsx` (new), `frontend/src/App.jsx` (+`/poc` route)

**Deferred (not built):** Data Analyst dashboard, realized FCR, analyst engine — per the build order.

## 18. Feature Log — Per-Iteration FCR + POC Confirmation Gate (built)

**What it is:** FCR is now computed independently per recipe iteration — T1, T2, T3 (trial), TR1, TR2, TR3 (training), and Final (MainRecipe) — instead of only the final recipe. This fixes a cross-write bug and adds a POC confirmation gate so the client only ever sees iterations the POC has explicitly signed off on.

**The bug that was fixed:** `postFcrItem` (POC price entry) used to write the same ingredient price simultaneously onto `MainRecipe` + `SubRecipe` + whichever phase model (Trial/Training) was selected, via one `updateMany` loop over all three. That meant entering a price on a T1 trial immediately overwrote the brand's Final recipe cost too. Now each price save is scoped to exactly ONE iteration document — brand + exact `recipeName` + phase + code (T1/TR2/etc, or no code for Final) — never multiple collections/iterations at once. `postFcrItem` body is now `{phase, recipeName, code, refId, uom, unitPrice, yieldPercent}` (was missing `recipeName`/`code` before; the price-entry UI is now iteration-scoped, not a flat brand-wide ingredient list).

**POC can now edit FINAL too:** previously FINAL/MainRecipe was only reachable via the old (buggy) simultaneous write. Now POC explicitly selects phase `FINAL` and edits MainRecipe directly, scoped to that one dish — for correction/confirmation, not as a side effect of trial edits.

**Confirmation gate (new collection `fcr_confirmations`, model `backend/models/fcrConfirmation.js`):** `{brandName, recipeName, phase, code, confirmed, confirmedBy, confirmedAt}`, unique on `{brandName, recipeName, phase, code}`. No iteration is visible to the client until the POC explicitly confirms it via `PATCH /api/poc/clients/:clientId/fcr-confirm`. Editing a price on an already-confirmed iteration auto-un-confirms it (forces re-confirmation, so the client never sees stale-confirmed data after a price change). The POC's view (`GET .../fcr-summary`) shows ALL iterations regardless of confirmation state, each tagged `{confirmed, confirmedBy, confirmedAt}`; the client's view (`GET /api/client/fcr/dishes`) only returns confirmed iterations — a dish with zero confirmed iterations still appears (so the client knows the dish exists) with an "Awaiting confirmation" state instead of being hidden.

**Bug fix — sub-recipes were missing from the displayed ingredient list (totalCost was always correct):** `iterationFcr.js`'s `buildItemRows` originally filtered to `type === "INGREDIENT"` only, silently dropping any `SUBRECIPE` line from a recipe's BOM in the UI — even though `calculateRecipeFromItems`'s cost math (via `expandItem`/`resolveSubRecipe`/`sumSubRecipeCost`) already correctly included sub-recipe cost in `totalCost` (level-0 SUBRECIPE breakdown entries were always summed in). Fixed by exporting `calculateCost`/`resolveSubRecipe`/`sumSubRecipeCost` from `costing.controller.js` (no logic changes — just `export` added) and reusing them in a new `buildSubRecipeRow()` in `iterationFcr.js`, which resolves the sub-recipe doc, computes its cost the same way `expandItem` does, and recursively builds its constituent ingredient rows (handles nested sub-recipes, same circular-ref guard pattern). `FcrIterationTimeline.jsx` renders sub-recipe rows as an expandable `▸ Name (sub-recipe)` line (qty, yield%, total cost) that reveals its own ingredient rows (same columns as direct ingredients) on click, indented one level, recursively for further nesting. `expandItem`, `resolveSubRecipe`'s logic, `calculateRecipeFromItems`, and recipe schemas were not modified — display-layer fix only.

**Bug fix — ₹NaN editing a sub-recipe price, then corrected again (manual override replaced with flattened ingredient pricing):** the first fix gave SUBRECIPE rows their own editable `netPrice`/`unitPrice` (defaulting to ₹0), which solved the NaN but introduced a worse problem — every never-manually-priced sub-recipe would silently show/total as ₹0, understating iteration cost without any visible error. Reverted that override path. The correct fix: sub-recipe cost must always be COMPUTED from its own ingredients (exactly what `calculateRecipeFromItems`/`expandItem`/`resolveSubRecipe`/`sumSubRecipeCost` already do — untouched), never manually entered as the default path.
- `iterationFcr.js`'s display rows (`buildItemRows`/`buildSubRecipeRow`) are back to computed-cost-only for SUBRECIPE rows (no editable netPrice/unitPrice on the sub-recipe entry itself).
- New `buildEditableIngredients()` in `iterationFcr.js` produces a SEPARATE flat list (`iteration.editableIngredients`) for price entry only: direct ingredients on the iteration, PLUS ingredients nested inside any sub-recipe it uses, flattened recursively (handles nested sub-recipes-within-sub-recipes) — never a row for the sub-recipe itself. Each row carries `source: "ITERATION"|"SUBRECIPE"` and, for nested rows, `subRecipeName`/`subRecipeBrand` (the actual resolved sub-recipe doc identity) so the UI/backend know where to write.
- `postFcrItem` (`poc.controller.js`) now takes `source`/`subRecipeName`/`subRecipeBrand` instead of the removed `itemType`. `source: "ITERATION"` writes the one iteration document as before (brand+recipeName+phase+code scoped). `source: "SUBRECIPE"` writes the shared `SubRecipe` document instead (matched by exact brand+recipeName) — pricing a nested ingredient updates that sub-recipe's cost everywhere it's used by any dish/iteration, exactly like the rest of the BOM already works (not iteration-scoped, by design). Auto-un-confirm still only un-confirms the iteration currently being viewed.
- `PocDashboard.jsx`'s "Edit Iteration Price" table now reads `iteration.editableIngredients` (not `iteration.items`) and shows a "From" column ("Direct" vs "‹Sub-recipe name› (sub-recipe)"). The read-only `FcrIterationTimeline.jsx` view (`iteration.items`) is unchanged from the original sub-recipe-display fix — sub-recipes still show as an expandable line with their computed total cost and constituent ingredients.
- Confirmed: no iteration ever shows ₹0 for a sub-recipe unless its ingredients are genuinely unpriced (a real, visible gap — not a fabricated placeholder); `totalCost` per iteration still equals exactly what `calculateRecipeFromItems` produces, since that function and `expandItem`/`resolveSubRecipe`/`sumSubRecipeCost` were never modified by either fix.

**UX — one "Save Changes" button per iteration instead of one per ingredient row, PLUS a separate "Confirm" button (two distinct actions, not merged):** `PocDashboard.jsx`'s edit table has no per-row Save button. Editing a price/yield input marks that row's key in local `edits` state and highlights the row (amber background + "● Unsaved" tag). Below the table, two buttons sit side by side:
- **"Save Changes"** (blue) — fires one `POST /api/poc/clients/:clientId/fcr-item` per row actually present in `edits` (via `Promise.allSettled`), reports saved-vs-failed, clears `edits`, reloads. Only persists prices — does NOT touch confirmation state (existing auto-un-confirm-on-edit behavior in `postFcrItem` is unchanged and still fires server-side if the iteration was confirmed).
- **"Confirm `<iteration>`" / "Un-confirm"** (green/grey) — calls the same `toggleConfirm` used by `FcrIterationTimeline`'s confirm buttons, scoped to the currently-selected dish+iteration. **Disabled whenever `changedKeys.length > 0`** (unsaved edits pending) or while saving — forces Save before Confirm is clickable, so the POC can never confirm an iteration with stale/unsaved prices. A status pill ("✓ Confirmed — visible to client" / "Pending — not visible to client") sits next to both buttons reflecting `iteration.confirmed`.
Only confirmed iterations are ever returned to the client by `GET /api/client/fcr/dishes` (unchanged gate). Purely a frontend interaction change — `postFcrItem`, `patchFcrConfirm`, `source`/`subRecipeName` routing, and auto-un-confirm are unchanged.

**No real FCR % exists anywhere** (no stored selling price on any recipe) — the UI shows `totalCost`/`suggestedSellingPrice` per iteration with trend arrows (cost going down = improvement), not a true cost÷price ratio. This was a pre-existing constraint, not introduced by this feature.

**New reusable engine (`backend/utils/iterationFcr.js`, `getDishIterations(brandName)`):** groups `TrialRecipe`/`TrainingRecipe` (recipeType `MAIN` only) + `MainRecipe` docs by trimmed-lowercased `recipeName`, runs each iteration's `items` through the existing `expandItem()`/`resolveSubRecipe()` traversal — now extracted from `costing.controller.js`'s `calculateRecipe()` into a reusable `calculateRecipeFromItems(items, brand)` (zero changes to `expandItem()` itself). Sub-recipe items inside trial/training recipes still always resolve against the final `SubRecipe` collection (unchanged — confirmed this was already how `AddTrialRecipe.jsx`/`AddTrainingRecipe.jsx` populate sub-recipe dropdowns).

**Frontend:** new shared component `frontend/src/components/FcrIterationTimeline.jsx` (tile grid → click dish → iteration chips with trend arrows → click iteration → ingredient breakdown table) used by both dashboards. Client `Dashboard.jsx` `FcrView` is now read-only timeline browsing. POC `PocDashboard.jsx` `FcrView` shows the same timeline (with confirm/un-confirm buttons) plus a separate "Edit Iteration Price" panel — dish + iteration dropdowns, then an editable ingredient table that saves via the now-iteration-scoped `postFcrItem`. `AddTrialRecipe.jsx`/`AddTrainingRecipe.jsx` got a one-line reminder near Recipe Name to keep dish names spelled identically across iterations (required for the grouping to work). `SopView` got a soft, non-blocking note that SOPs are typically created during training.

**Files involved:**
- `backend/controllers/costing.controller.js` (extracted `calculateRecipeFromItems`), `backend/utils/iterationFcr.js` (new), `backend/models/fcrConfirmation.js` (new)
- `backend/controllers/client.controller.js` (+`getDishIterations`), `backend/routes/client.routes.js` (+`GET /fcr/dishes`)
- `backend/controllers/poc.controller.js` (`postFcrItem` rewritten to be iteration-scoped + auto-unconfirm; +`patchFcrConfirm`; `getFcrSummary` now joins confirmations), `backend/routes/poc.routes.js` (+`PATCH /fcr-confirm`), `backend/services/pocData.service.js` (`getFcrSummary` rewritten on `getDishIterations`)
- `frontend/src/components/FcrIterationTimeline.jsx` (new, shared), `frontend/src/pages/Dashboard.jsx` (`FcrView` rewritten), `frontend/src/pages/PocDashboard.jsx` (`FcrView` rewritten, `SopView` note), `frontend/src/pages/AddTrialRecipe.jsx`, `frontend/src/pages/AddTrainingRecipe.jsx` (reminder text)

**Deferred (not built):** "Promote training recipe to Final" (Head Chef territory), realized/actual-spend FCR.

## 19. Feature Log — Per-Client Custom Onboarding Tasks (built)

**What it is:** The POC dashboard's Onboarding Status board can now add/remove tasks per client, on top of the existing 15 `MASTER_SERVICES` toggle-only behavior. Purely additive — toggling status (`PATCH .../onboarding-task`) is unchanged.

- `POST /api/poc/clients/:clientId/onboarding-task` `{ taskName }` — appends a new PENDING task to that client's `BrandServiceChecklist.services` only (other clients and the `MASTER_SERVICES` seed list are untouched). Rejects empty/whitespace names and case-insensitive duplicates within that same client's list ("Task already exists").
- `DELETE /api/poc/clients/:clientId/onboarding-task` `{ taskName }` — removes a task (case-insensitive match) from that client's list only, permanently. Not protected: the original 15 seeded tasks can be removed exactly like a custom one — 404 if the name isn't found. A completed task can be removed with no special blocker.
- `onboardingPercent()` (`poc.controller.js`) was already `completed / services.length` (never hardcoded `/15`) — confirmed correct, no change needed there; it now naturally reflects each client's actual task count after adds/removes, both on the client-list % column and the per-client header.
- New clients still seed from `MASTER_SERVICES` unchanged (`ensureChecklist()`'s create-if-missing + add-missing-master-services logic untouched) — custom tasks are added on top, never replacing the seed.
- `client.controller.js`'s `getOnboardingStatus` (client-side read-only view) needed NO changes — it already maps `checklist.services` dynamically, so added/removed tasks just show up for that brand automatically.

**Frontend (`PocDashboard.jsx`'s `OnboardingView`):** each task row gets an "✕" remove button using a click-twice confirm pattern (first click arms it — row turns red with a "Click ✕ again to remove permanently" warning — second click on the same task actually deletes; clicking a different task's ✕, or toggling any status, disarms it). Below the task list, a text input + "Add Task" button (Enter key also submits) posts the new task and reloads.

**Files involved:**
- `backend/controllers/poc.controller.js` (+`postOnboardingTask`, +`deleteOnboardingTask`), `backend/routes/poc.routes.js` (+`POST`/`DELETE /onboarding-task`)
- `frontend/src/pages/PocDashboard.jsx` (`OnboardingView` rewritten with remove + add UI)

**Not touched (out of scope):** the legacy `WALLET_MANAGER`-gated `/api/admin/services/:brandId` add/delete endpoints in `admin.brand.routes.js` (a separate, older admin-dashboard checklist UI) — left exactly as they were.

## 20. Feature Log — Stock Manager Dashboard (built, B2C)

**What it is:** The third of the six role-scoped dashboards (Dashboard #3, the first **producer** dashboard). A dedicated, brand-first tool at `/stock-manager` for the base-kitchen (JP Nagar) warehouse owner. It **re-scopes the existing `INGREDIENT_MANAGER` code role** (no new role) and **migrates** the Ingredient-Admin views out of `AdminDashboard.jsx` into their own dashboard. As a producer dashboard, every write path emits one `procurement_logs` entry — the Data Analyst dashboard's (#6) primary read source.

**Role / routing:** No new role — `requireRole("INGREDIENT_MANAGER")` gates all `/api/stock-manager/*` routes. The POC routing-gap lesson is applied end-to-end: `Login.jsx` and `Navigation.jsx` send an INGREDIENT_MANAGER login straight to `/stock-manager` (keyed off the JWT role, not userType); `AdminDashboard.jsx` bounces them via `useEffect` AND gates the `BrandList` mount (`!isPoc && !isIngredientManager`) so `GET /api/admin/brands` never fires during the redirect frame.

**Schema additions (all additive):**
- `itemmasters` (still `strict:false`): typed `shelfLifeDays`, `minStockLevel`, `minStockUom` (operational thresholds, brand-agnostic; existing rows null → UI "Not set"). `reorderCadenceDays` deliberately NOT added — cadence is derived from purchase history.
- `stock_updates`: `variances[]` (`{itemName,uom,expectedQty,actualQty,varianceQty,reason,reasonNote}`), `lockedAt`, `lockedBy`, `correctionSeq`, `correctionOf`. **Unique index changed** `{brandId,date}` → `{brandId,date,correctionSeq}` so post-lock corrections coexist as stacked records. The legacy index must be dropped once via `backend/scripts/migrateStockUpdateIndex.js`. Both legacy upserts (`stockUpdate.controller.upsertStockUpdate`, `poc.controller.postDailyStock`) were pinned to `correctionSeq:0` so they stay deterministic.
- `vendors`: `status` (ACTIVE/INACTIVE), `notes`, `createdBy`, `lastDeliveryAt`.
- **NEW `delivery_qc`** (`backend/models/deliveryQc.js`): 1:1 with a Purchase Register row; planned/purchased/received qty + qcStatus (PENDING|ACCEPTED|SHORT|REJECTED|PARTIAL).
- **NEW `procurement_logs`** (`backend/models/procurementLog.js`): append-only event stream. Emitted via `backend/utils/procurementLog.js` `emitProcurementLog()` (best-effort, never throws/blocks a real write).

**Endpoints (`backend/controllers/stockManager.controller.js`, routes `backend/routes/stockManager.routes.js`, mounted `/api/stock-manager`, all INGREDIENT_MANAGER-gated):**
- `GET /brands-summary`, `GET /all-brands-rollup` — aggregations over `brand_stocks`/`purchase_register`/`ingredient_indents` (brand list sourced from client `User` records).
- `GET /stock/:brandName` (+`/expiring?days=`, +`/low`) — Purchase Register batches joined with `itemmasters` thresholds; per-row `nearExpiry` (within `shelfLifeDays/2` of expiry OR within 5 days) + `belowMin` flags.
- `GET /indents/:brandName?status=` — brand-scoped indent list with `source` (PROJECTION/CUSTOM, derived from `recipeKind`) + `warehouseStockAvailable`. **Verify/Issue REUSE the existing untouched `/api/ingredient-indent/:id/verify|issue`**; the UI calls `POST /indents/log` after a success so the analytics stream stays complete without modifying the frozen indent controller.
- `POST /grn` + `GET /qc-failures` — GRN+QC in one form. Credits Purchase Register ONLY on ACCEPTED/PARTIAL (PARTIAL credits receivedQty); SHORT/REJECTED record a `delivery_qc` failure for Head-Chef visibility (no indent-status mutation — the indent enum was left frozen). Updates vendor `lastDeliveryAt`. Emits PURCHASE (on credit) + QC per item.
- `GET /vendor-alerts/:brandName` + `DELETE /vendor-alerts/:id` — per-brand "Vendor Alerts" (the renamed Credit Note flow). Reads/deletes `credit_note_alerts`; resolve emits VENDOR_ALERT_RESOLVED. No money code.
- `GET /purchases` — chronological Purchase Register view, QC joined; filters brand/vendor/item/from/to/qcStatus.
- `GET/POST /closing-stock/:brandName`, `PATCH .../lock`, `POST .../correction` — daily audit. GET returns the locked records as a **stacked history** (original seq 0 + all corrections, never collapsed) or, when none exists, a system-expected snapshot from Warehouse Stock. Non-zero variance rows REQUIRE a reason. Lock sets `lockedAt`/`lockedBy` (immutable) and reconciles actuals into `brand_stocks` via the SAME RECONCILIATION pattern `upsertStockUpdate` uses. Corrections append new `correctionSeq` records (immutable). Closing-stock writes only `stock_updates` (never the P1-sensitive `brand_stocks` ledger directly, except the same best-effort reconcile sync). Emits STOCK_RECONCILED + VARIANCE_RECORDED.
- `GET /reorder-insights/:brandName` — derived per-item cadence/advisory (OK|BELOW_MIN|NEAR_EXPIRY|CADENCE_DRIFT). Read-only; never auto-indents.
- `PATCH /ingredient/:itemName` — Stock Manager owns the catalog thresholds. Emits INGREDIENT_THRESHOLD_SET.
- `GET /vendors` (+`/:id` detail with recent purchases), `POST /vendors`, `PATCH /vendors/:id`, `PATCH /vendors/:id/status` — global vendor management (reuses the `Vendor` model; SM-created vendors get a random bcrypt password since they don't log in yet). Emits VENDOR_CREATED/VENDOR_UPDATED.

**procurement_logs emitting paths (the analyst stream):** GRN→PURCHASE+QC; closing-stock lock/correction→STOCK_RECONCILED+VARIANCE_RECORDED; indent verify/issue→INDENT_VERIFIED/INDENT_ISSUED (via `/indents/log`); ingredient thresholds→INGREDIENT_THRESHOLD_SET; vendor create/update→VENDOR_CREATED/VENDOR_UPDATED; vendor-alert resolve→VENDOR_ALERT_RESOLVED.

**Disposition of the 4 legacy Ingredient-Admin tools that were NOT auto-carried (decided after review):**
- **Update Ingredients (bulk price)** — **permanently removed.** It posted to `bulkUpdateIngredientPrices` (`MainRecipe.updateMany` + `SubRecipe.updateMany` filtered by `items.refId` only, **no brand filter** = global cross-brand price writer). Restoring it would undo the POC build's deliberate per-brand-only fix (§17/§18). Per-brand price management lives in the POC dashboard. The code remains in `AdminDashboard.legacy.jsx` as record only.
- **Stock (Rista)** — **deferred to the Head Chef dashboard** (see the carry-forward note in the roadmap above). Not restored here.
- **Credit Note → renamed "Vendor Alerts"** — **FOLDED IN.** A new per-brand workspace drawer item "Vendor Alerts" (placed after GRN+QC) reads `GET /api/stock-manager/vendor-alerts/:brandName` and resolves via `DELETE /api/stock-manager/vendor-alerts/:id` (click-twice confirm). It's a Head-Chef→Stock-Manager operational handoff touching ONLY `credit_note_alerts` — **zero money code** (no wallet/dues/GST/Razorpay). The **collection name `credit_note_alerts` is unchanged** (only the UI label/drawer entry say "Vendor Alerts"). Resolving an alert hard-deletes it (mirrors legacy) AND emits a `VENDOR_ALERT_RESOLVED` procurement log carrying the ingredient/brand/note so the audit trail survives. The Head Chef still creates alerts via the existing `POST /api/credit-notes` (untouched).
- **Check Stock → "All Audits"** — **FOLDED IN** as a top-level tab next to "Vendors". Read-only cross-brand/all-dates roll-up of `stock_updates`, reusing the existing `GET /api/stock-updates/all` with **no backend change** (brand/date filter + expandable item rows). Distinct from the per-brand Closing Stock Audit and from Stock Overview (Purchase Register).

**Migration / cleanup:** `AdminDashboard.jsx` saved verbatim as `AdminDashboard.legacy.jsx` first. Then the 7 Ingredient-Admin modals (`InventoryModal`/Stock-Rista, `IngredientsModal`, `IngredientInventoryModal`, `CreditNoteModal`, `CheckStockModal`, `StockUpdateModal`, `PurchaseRegisterModal`) + their menu buttons, modal mounts, and `useState` were removed from `AdminDashboard.jsx` (grep-confirmed they're referenced nowhere else). The new dashboard rebuilds the Purchase-Register, indent-queue, and stock-update concepts cleanly against the new endpoints. The Recipe-Admin's `GrnModal` and all recipe-manager UI are untouched. No backend routes were deleted (the new dashboard still uses `/api/ingredient-indent` for verify/issue), so no dead routes.

**Untouched / frozen (verified):** NO money/wallet/GST/dues code touched or added. NO sub-recipe dispatch to local kitchens built (Head Chef territory). `applyStockCascade`, `expandItem`, `bomExpander`, the `brand_stocks` schema, the `purchase_register` schema + FEFO logic, and the projection-driven indent generation in `convertProjectionToProductionOrder` are all UNCHANGED. No B2B per-brand warehouse entity (one central warehouse, brand-tagged stock inside it).

**Run-once after deploy:** `node backend/scripts/migrateStockUpdateIndex.js` (drops the legacy `stock_updates` unique index). Backfill: existing `itemmasters` thresholds stay null ("Not set" in UI); legacy `stock_updates` rows are unlocked legacy data — not retroactively locked.

**Files involved:**
- `backend/models/procurementLog.js` (new, incl. `VENDOR_ALERT_RESOLVED` event), `backend/models/deliveryQc.js` (new), `backend/models/itemMaster.js`, `backend/models/stockUpdate.js`, `backend/models/vendor.js`, `backend/models/creditNoteAlert.js` (read-only reuse for Vendor Alerts)
- `backend/utils/procurementLog.js` (new), `backend/scripts/migrateStockUpdateIndex.js` (new)
- `backend/controllers/stockManager.controller.js` (new; +Vendor Alerts get/resolve), `backend/routes/stockManager.routes.js` (new; +vendor-alerts routes), `backend/index.js` (mounts `/api/stock-manager`)
- `backend/controllers/stockUpdate.controller.js` + `backend/controllers/poc.controller.js` (pinned to `correctionSeq:0`)
- `frontend/src/pages/StockManager.jsx` (new; per-brand workspace + "Vendor Alerts" drawer item + top-level "All Audits" tab; client-dashboard color scheme, rounded pill nav with Skope logo + Logout, shared `Footer`, no emojis), `frontend/src/App.jsx` (+`/stock-manager` route), `frontend/src/pages/AdminDashboard.jsx` (bounce + BrandList gate + Ingredient-Admin views removed), `frontend/src/pages/AdminDashboard.legacy.jsx` (verbatim rollback copy, not routed — also the record-only home of the permanently-removed bulk price tool), `frontend/src/components/Navigation.jsx` + `frontend/src/pages/Login.jsx` (Stock Manager redirects)

**Deferred (not built at §20 time; Head Chef + Local Kitchen now BUILT — see §21/§22):** Data Analyst dashboard, realized FCR, analyst engine; low-stock auto-indent assist; first-time-ingredient Out-of-Stock exception — per the build order.

**Carry-forward / known correctness item (post-deployment cleanup, low priority):** The warehouse closing-stock audit reconcile (`reconcileAuditToLedger` in `stockManager.controller.js`) silently skips an ingredient when there are multiple `brand_stocks` rows for the same brand (e.g. the same ingredient stocked in WAREHOUSE_DRY + WAREHOUSE_CHILLER) — the Store Manager matcher filters on `{brandName, itemName}` only, with NO location filter, so any item held in >1 location hits the "`stockDocs.length > 1` → warn + continue" guard and never reconciles (the variance is recorded in the audit but never pushed to the ledger). The producer audits (Head Chef §21 / Local Kitchen §22, shared `producerAudit.js`) do NOT have this issue — they filter by `branchCode` + `location`, so they reliably land exactly one row. **Fix:** tighten the warehouse matcher to include `location` (and `branchCode`), OR surface the skip-warning visibly to the Store Manager when it fires (today it only goes to `console.warn`). Low-priority correctness item; track for post-deployment cleanup.

## 21. Feature Log — Head Chef Dashboard (built, B2C)

**What it is:** Dashboard #4 of 6 (2nd producer dashboard). A brand-first tool at `/head-chef` for the base-kitchen (JP Nagar) Head Chef. Code role: **RECIPE_MANAGER** (no new role). Owns recipe lifecycle, promote-to-final, bulk sub-recipe production planning, dispatch to local kitchens, indents + vendor alerts to the Stock Manager, SEMI_FINISHED stock audit, ingredient lists to the POC, and Rista POS reconciliation. NEVER touches money (frozen).

**Coexistence (deliberate, founder-approved):** Built **ALONGSIDE** the legacy `AdminDashboard.jsx`, NOT as a migration. The legacy recipe-admin views (RecipesModal, TrialTrainingModal, GrnModal, MapIngredientsModal, etc.) are **untouched and still work**; `/head-chef` links to them via an "Open Recipe Editor" button.

**Recipe editing — HONEST CURRENT STATE (no native editor inside `/head-chef` yet):** the Head Chef Recipes/Trials/Training drawer tabs are **navigation entry points, not embedded editors**. Specifically:
- **"Add new ingredient to catalog"** — native form in `/head-chef` (`POST /api/head-chef/ingredient`). ✅ Also native: Promote-to-Final, Send-ingredient-list-to-POC, read-only FCR timeline.
- **Recipe creation** — done on the existing standalone builder pages (`/add-recipe` [MAIN + SUB], `/add-trial-recipe`, `/add-training-recipe`), **linked** from the Head Chef tabs, NOT embedded in `HeadChef.jsx`.
- **Recipe editing** (changing an existing main/sub/trial/training BOM) — currently has **no path inside `/head-chef`**; it uses the **AdminDashboard recipe modals** via the "Open Recipe Editor" link (the `/add-*` pages are create-oriented, no load-existing-by-id).
- **A native recipe workspace inside `HeadChef.jsx` is a planned follow-up** — not yet built. The earlier wording here ("Recipe/Trial/Training CRUD is REUSED … no UI duplication") was true about *reuse* but wrongly implied the CRUD surface lives in the new dashboard; it does not.

CRUD still routes to the existing RECIPE_MANAGER-gated APIs (`/api/mainrecipes`, `/api/subrecipes`, `/api/trial-recipes`, `/api/training-recipes`, `/api/ingredient-indent`) — no controller duplication.

**EXPLICIT FOLLOW-UP (do NOT lose):** a **native recipe editor inside `/head-chef` is a PREREQUISITE** for removing the legacy recipe-admin views from `AdminDashboard.jsx`. Until that editor is built, the legacy `AdminDashboard` **remains the recipe-editing surface** and must NOT be removed. (`AdminDashboard.legacy.jsx` already exists as rollback for whenever that removal eventually happens.)

**Final pricing decision:** Head Chef edits Final (MainRecipe) prices via the existing recipe-edit flow it owns (through the legacy editor). The POC's per-iteration price writer + confirmation gate (§18) was **NOT** touched.

**New backend — `/api/head-chef` (controller `headChef.controller.js`, routes `headChef.routes.js`, all `requireRole("RECIPE_MANAGER")`):**
- `GET /brands-summary` — per-brand tiles (main recipes, pending trials/training [count − confirmed], confirmed finals, pending indents, QC failures) + `clientId`.
- `POST /ingredient` — adds an `itemmasters` row (shelfLife/minStock left null — Stock Manager owns those).
- `POST /clients/:clientId/ingredient-list` `{phase,code,recipeName?}` — extracts a trial/training iteration's BOM (shared `extractIngredientsFromBOM`+`aggregateIngredients`) into a new **`ingredient_lists_to_poc`** record (`listType:"BOM_EXTRACTED"`); 404 if recipe missing. → POC panel (§17 addition below). **Resolver:** when `recipeName` is provided it disambiguates by `brand + recipeName + code` (anchored case-insensitive); when omitted it falls back to the FIRST match by `brand + code` (legacy behavior). The Head Chef UI sends `recipeName` via a required dish dropdown — earlier wording here implied `recipeName` was always part of resolution, which it was not until the dropdown fix.
- **`POST /clients/:clientId/ingredient-list-custom` `{phase,code,recipeName,items:[{itemName,manufacturerBrand?,qty,uom}]}` (built — closes the T1 pre-BOM dead end).** The BOM extraction above is a dead end for a brand-new dish: T1 can't be cooked without ingredients, but no recipe/BOM exists to extract from until T1 is cooked. This hand-typed alternative lands in the SAME `ingredient_lists_to_poc` collection with `listType:"CUSTOM"` — it creates no recipe/sub-recipe/ItemMaster, purely a procurement message to the POC. Validates `recipeName` (required, manually typed) and each item (`itemName` required, `qty>0`, `uom`∈GM/KG/PC; `manufacturerBrand` optional, e.g. "Eastern", "Aashirvaad"). Emits the same `INGREDIENT_LIST_SENT_TO_POC` event with `metadata.listType:"CUSTOM"`. UI: `HeadChef.jsx`'s ingredient-list card has a "From Recipe (BOM)" / "Custom List" toggle; Custom List shows a dynamic ingredient-rows table. POC panel shows a "Custom"/"From BOM" badge per list and `manufacturerBrand` inline per item — same acknowledge flow, no POC backend change.
- `POST /promote-to-final` `{brandName,recipeName,sourceCode:TR1|TR2|TR3}` — copies the training BOM into MainRecipe (update if exists, else create). `getDishIterations` then surfaces the Final tile automatically — no change to the FCR engine.
- `GET /production-plan?brandName=&date=` — read-only; explodes CHEF_CONFIRMED projections' MainRecipe BOMs into required sub-recipe qty with per-kitchen breakdown.
- `POST /dispatch` — validates SEMI_FINISHED availability, **atomically** (mongoose session) debits `brand_stocks` SEMI_FINISHED@JPNAGAR (TRANSFER_OUT) + creates a **`subrecipe_dispatches`** `DISPATCHED` row (destination credited on receipt, QC-style). Can fulfil a Local-Kitchen `REQUESTED` row. `GET /dispatches`, `/dispatches/discrepancies`, `/requests`.
- `GET /indents` (brand-scoped, with source + warehouseStockAvailable), `POST /indents/custom` (mirrors `createIndent` doc shape; Stock Manager's verify/issue handle it unchanged).
- `GET /qc-failures` (reads `delivery_qc` SHORT/REJECTED), `POST /vendor-alerts` + `GET /vendor-alerts` (raises/lists `credit_note_alerts`, `createdByRole:"RECIPE_MANAGER"` — Stock Manager resolves).
- `GET/POST /audit/:brandName` + `PATCH /audit/:brandName/lock` — **SEMI_FINISHED audit** (see "Audit storage" below).
- `GET /reorder-insights` (projection-aware shortfall vs on-hand; one-click → custom indent).
- `GET /rista-stock-comparison?brandName=&branchCode=` — **FUTURE-HOOK**; `ristaClient.getInventory` (JPNAGAR→BEN, MARATHAHALLI→MAR) joined vs Purchase Register; **graceful `{configured:false,rows:[]}` when Rista isn't wired** — never errors.
- `GET /fcr/:brandName` (reuses `getDishIterations`), `GET /menu/:brandName` + `GET /projections/:brandName` (read-only).

**Audit storage — DEVIATION FROM PLAN (data-safety, flagged):** the plan said reuse `stock_updates` for the Head Chef SEMI_FINISHED audit. During build I found `stock_updates`' unique key `{brandId,date,correctionSeq}` is NOT branch/scope-aware and the client's brand-wide "Daily Stock" view + the Stock Manager's warehouse audit already own those rows — so a same-brand/same-day producer audit would (a) duplicate-key error and (b) corrupt client Daily Stock. **Fix:** a dedicated additive **`producer_audits`** collection keyed `{brandId,branchCode,scope,date,correctionSeq}` (scope = `BASE_SEMI_FINISHED` | `LOCAL`), reusing the proven lock + correctionSeq-stacking + reconcile-to-`brand_stocks` PATTERN via shared `backend/utils/producerAudit.js`. Reconcile is scoped to the audit's specific location+branchCode (SEMI_FINISHED@JPNAGAR for Head Chef). `stock_updates` schema untouched.

**procurement_logs emitting paths (the analyst stream):** ingredient-list→`INGREDIENT_LIST_SENT_TO_POC`; promote→`RECIPE_PROMOTED`; dispatch→`SUBRECIPE_DISPATCHED`; vendor alert→`VENDOR_ALERT_RAISED`; base audit lock/correction→`BASE_KITCHEN_AUDIT_LOCKED`+`VARIANCE_RECORDED`. (Reads — brands-summary, production-plan, indents list, qc-failures, reorder, rista, fcr, menu/projections — emit nothing, by design.)

**POC addition (small, additive — NOT a redesign):** `GET /api/poc/clients/:clientId/ingredient-lists` + `PATCH .../ingredient-lists/:listId/acknowledge`; an "Ingredient lists from kitchen" panel was spliced into `PocDashboard.jsx`'s existing `ProcurementView`. No other POC change.

**Procurement price entry + invoice raising on kitchen lists (built — separate from FCR pricing).** The kitchen-list panel was read-only (acknowledge only) — the POC had no way to enter what the vendor actually charges, or to bill the client for it. This is a **vendor/procurement cost**, entirely independent of FCR/recipe pricing (`postFcrItem`) — no shared code path. `IngredientListToPoc` items gained `unitPrice`/`totalPrice` (both null by default); the document gained `pricingStatus` (`AWAITING_PRICING`→`PRICED`→`INVOICE_RAISED`), `grandTotal`, `invoiceId`. `PATCH /api/poc/clients/:clientId/ingredient-lists/:listId/prices` `{items:[{itemName,unitPrice}]}` matches by case-insensitive `itemName`, computes `totalPrice=qty×unitPrice` per row and `grandTotal`, flips to `PRICED` only once every item is priced (partial pricing stays `AWAITING_PRICING`); **409 once `INVOICE_RAISED`** — prices lock after invoicing so the list can't drift from the already-created Razorpay order. `POST .../ingredient-lists/:listId/raise-invoice` requires `PRICED` + `grandTotal>0`, checks `client.procurement[phase].mode === "SKOPE_PROCURES"` server-side (400 otherwise — not just a UI hide), then raises a standard `PROCUREMENT` invoice on `User.invoices[]` via the exact same Razorpay-order + email pattern `postInvoice` uses (no `User` schema change — every field already existed), and stamps `invoiceId`/`pricingStatus:"INVOICE_RAISED"` back onto the list. `ProcurementView`'s list fetch dropped its `status=PENDING` filter (now fetches all lists) so a list stays visible through pricing/invoicing after "Mark seen" instead of disappearing. New `KitchenListCard` sub-component renders an editable price/total table per list with a live grand total, colored by `pricingStatus` (amber=awaiting, neutral=priced, green=invoiced), and the Raise-Invoice button only when `client.procurement[phase].mode` is SKOPE_PROCURES (client-side convenience only — the 400 above is the real gate). Works identically for `BOM_EXTRACTED` and `CUSTOM` lists — no `listType` branching in the pricing/invoice logic.

**Routing-gap fix:** `Login.jsx` + `Navigation.jsx` send RECIPE_MANAGER → `/head-chef` (and LOCAL_KITCHEN → `/local-kitchen`). `AdminDashboard.jsx` keeps RECIPE_MANAGER fully functional (coexistence) and adds only a defensive LOCAL_KITCHEN bounce + BrandList mount-gate. Fresh RECIPE_MANAGER login lands on `/head-chef` with no admin flash / no 403.

**Files:** new `backend/controllers/headChef.controller.js`, `backend/routes/headChef.routes.js`, `backend/models/subrecipeDispatch.js`, `backend/models/ingredientListToPoc.js`, `backend/models/producerAudit.js`, `backend/utils/producerAudit.js`; edited `backend/models/procurementLog.js` (+8 event types), `backend/index.js` (mounts `/api/head-chef`), `backend/controllers/poc.controller.js` + `backend/routes/poc.routes.js` (+ingredient-list read/ack); new `frontend/src/pages/HeadChef.jsx`; edited `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/Navigation.jsx`, `frontend/src/pages/AdminDashboard.jsx`, `frontend/src/pages/PocDashboard.jsx`.

## 22. Feature Log — Local Kitchen Dashboard (built, B2C)

**What it is:** Dashboard #5 of 6 (3rd producer dashboard). A branch-scoped tool at `/local-kitchen` for the normal/local kitchens. New role **`LOCAL_KITCHEN`** (added to `AdminUser.role` enum + `authMiddleware`'s `ADMIN_ROLES` set). **One login per kitchen** — seeded from numbered `ADMIN_LOCALKITCHEN_<n>_*` env blocks (username/password/branchCode) in `seedAdminUsers.js`; each account's `branchCode` (on the JWT, already plumbed) scopes EVERY view to that kitchen. Receives dispatched sub-recipes, does final assembly, audits its own stock, requests replenishment. NEVER touches money (frozen).

**Endpoints (`/api/local-kitchen`, controller `localKitchen.controller.js`, routes `localKitchen.routes.js`, all `requireRole("LOCAL_KITCHEN")`, branch-scoped from `req.user.branchCode`):**
- `GET /brands` — brands whose `assignedBranches` includes this kitchen.
- `GET /dispatches` (`toBranchCode===this kitchen`), `PATCH /dispatches/:id/acknowledge` `{status,discrepancyNote?}` — RECEIVED atomically credits BRANCH_KITCHEN@kitchen (TRANSFER_IN, upsert) + emits `SUBRECIPE_RECEIVED`; DISCREPANCY saves note, no credit (surfaces in Head Chef's discrepancies view).
- `GET /stock/:brandName` — `brand_stocks` at this kitchen, by location.
- `GET/POST /audit/:brandName` + `PATCH /audit/:brandName/lock` — LOCAL-scope `producer_audits` (same shared machinery as §21; reconciles to BRANCH_KITCHEN+SEMI_FINISHED@kitchen). Emits `LOCAL_KITCHEN_AUDIT_LOCKED`+`VARIANCE_RECORDED`.
- `POST /indent` `{brandName,requestType,items[]}` — `RAW_INGREDIENT` → an `INVENTORY_TRANSFER` `ingredient_indents` row routed to the Stock Manager (reuses existing indent shape, no schema change); `SUB_RECIPE` → a `subrecipe_dispatches` `REQUESTED` row for the Head Chef. Emits `LOCAL_KITCHEN_INDENT_RAISED`. `GET /indents` lists both.
- `GET /recipes/:brandName`, `/menu/:brandName`, `/projections/:brandName`, `/fcr/:brandName` — read-only (menu/projections branch-scoped; recipes/fcr brand-wide).

**Every brand-scoped handler validates the brand is assigned to this kitchen (403 otherwise) — no cross-kitchen or cross-brand bleed.**

**Files:** new `backend/controllers/localKitchen.controller.js`, `backend/routes/localKitchen.routes.js`, `frontend/src/pages/LocalKitchen.jsx`; edited `backend/models/adminUser.js` (+LOCAL_KITCHEN), `backend/middleware/auth.js` (+LOCAL_KITCHEN in ADMIN_ROLES), `backend/scripts/seedAdminUsers.js` (+LOCALKITCHEN loop), `backend/index.js` (mounts `/api/local-kitchen`), `frontend/src/App.jsx`. Shares `subrecipe_dispatches`, `producer_audits`, `procurementLog`, `producerAudit.js`, and `emitAuditLogs` (exported from `headChef.controller.js`) with §21.

**Run-once after deploy:** add the `.env` keys below and run `node backend/scripts/seedAdminUsers.js` once (idempotent upsert; same pattern as the POC account) so the three Local Kitchen logins exist:
```
ADMIN_LOCALKITCHEN_1_USERNAME=...        ADMIN_LOCALKITCHEN_1_PASSWORD=...   ADMIN_LOCALKITCHEN_1_BRANCH_CODE=MARATHAHALLI
ADMIN_LOCALKITCHEN_2_USERNAME=...        ADMIN_LOCALKITCHEN_2_PASSWORD=...   ADMIN_LOCALKITCHEN_2_BRANCH_CODE=JAYANAGAR
ADMIN_LOCALKITCHEN_3_USERNAME=...        ADMIN_LOCALKITCHEN_3_PASSWORD=...   ADMIN_LOCALKITCHEN_3_BRANCH_CODE=JPNAGAR_KITCHEN
```

**Deferred (not built):** Data Analyst dashboard (#6), realized FCR, analyst engine — per the build order.

## 23. Feature Log — Client Audit Visibility + Store Manager Stock % Indicators (built)

Two contained, additive UI/read features on the **Client** and **Store Manager** dashboards. No schema changes, no logic changes to existing flows.

### Feature 1 — Client "Audit History" view (NEW, LIVE-gated)
A new drawer item **"Audit History"** on the Client Dashboard, separate from and additive to the existing **Daily Stock** view (which is **UNCHANGED** — same `GET /api/client/daily-stock`, same `getDailyStock`, same UI, still serving the IN_TRIAL workflow). Audit History is **read-only** and **gated on `lifecycleStage === "LIVE"`** on BOTH frontend (drawer shows a "Locked" badge + `LockedNotice`, same pattern as projections/analytics) and backend (403).

Three read sources, **locked audits only** (`lockedAt != null`):
- **Warehouse Audits** (brand-wide) — `stock_updates` docs written by the Store Manager closing-stock lock/correction. Reads the doc's `variances[]` (expected/actual/variance/reason/reasonNote). POC/legacy daily-stock rows never set `lockedAt`, so this filter cleanly excludes them.
- **Local Kitchen Audits** (PER BRANCH) — `producer_audits` `scope: "LOCAL"`, grouped by `branchCode`. Every assigned branch surfaces (empty `audits[]` → per-branch "No audits yet for {branch}" empty state). Optional `branchCode` filter validated against `assignedBranches` (403 otherwise).
- **Base Kitchen Audits** — `producer_audits` `scope: "BASE_SEMI_FINISHED"` (Head Chef SEMI_FINISHED @ JP Nagar).

**Top-level welcome empty-state:** when ALL three sections are empty simultaneously (common right after go-live), a single "No audit history yet…" message replaces the three stacked empty cards. Once any audit appears anywhere, the normal three-section layout renders.

**`producer_audits` is now a CLIENT read source** (previously internal/producer-only). Access is **read-only** — the schema is untouched.

New endpoints in `client.controller.js` (+ `client.routes.js`), all `requireLiveClient` (403 line refs: `getWarehouseAudits`, `getLocalKitchenAudits`, `getBaseKitchenAudits` each call shared `requireLiveClient`, which writes the 403):
- `GET /api/client/audits/warehouse?from=&to=`
- `GET /api/client/audits/local-kitchen?from=&to=&branchCode=`
- `GET /api/client/audits/base-kitchen?from=&to=`
Date range defaults to last 7 days. Every endpoint filters strictly by `brandId === req.user._id` — no cross-brand leak; branch filter validated against `assignedBranches`.

### Feature 2 — Store Manager stock % indicators (frontend-only)
A reusable `<StockPercentBar currentQty minStockLevel />` (in `StockManager.jsx`) added to BOTH **Reorder Insights** (uses `currentQty`) and **Stock Overview** (uses item-level `itemTotalRemaining`). Both endpoints already returned `currentQty`/`itemTotalRemaining` + `minStockLevel` — **no backend change**. Colored bar: **red `< 25%`, amber `25–75%`, green `> 75%`**, capped at 100% with an "Above min" label above the minimum; "Threshold not set" when `minStockLevel` is null (set inline via the existing Thresholds editor → `PATCH /api/stock-manager/ingredient/:itemName`).

### Emoji sweep (UI-only)
Per the no-emoji convention used by POC/Stock Manager/Head Chef/Local Kitchen, ALL pictographic emojis were removed from `Dashboard.jsx`: drawer item icons (now plain text labels, first letter when collapsed — POC convention), Home button, the 🔒 lock indicator (drawer badge → "Locked" text; `LockedNotice` decorative circle removed), ⚠️ on the pending-due banner, ➕/➖ on wallet transaction rows, and the 🍽️ profile placeholder (→ brand initial, matching the other dashboards' avatar convention). The shared `✕` remove/close glyph is retained (same convention as the other four dashboards). Copy, UX, and logic otherwise unchanged.

**Files involved:**
- `backend/controllers/client.controller.js` (+`ProducerAudit` import; +`requireLiveClient`/`parseAuditRange`/`mapVarianceRow` helpers; +3 audit handlers), `backend/routes/client.routes.js` (+3 routes)
- `frontend/src/pages/Dashboard.jsx` (+`AuditHistoryView`/`AuditCard`/`AuditItemsTable`; drawer item + render branch; full emoji sweep), `frontend/src/pages/StockManager.jsx` (+`StockPercentBar` + one column in Reorder Insights and Stock Overview)

**Untouched / verified:** existing Daily Stock view + endpoint; `stock_updates` & `producer_audits` schemas (read-only); authMiddleware, applyStockCascade, bomExpander, brand_stocks/purchase_register/recipe schemas, wallet/payment/GST, signup, nav, footer; POC / Head Chef / Local Kitchen dashboards.

## 24. Feature Log — Wallet-Free Invoice & GRN Flow (Razorpay-Direct + Email + Supplementary Invoices) (built)

**What it is:** A system-wide invoicing/payment redesign across the **Client**, **POC**, and **Stock Manager** dashboards. The wallet flow is **deprecated** — every invoice (ONBOARDING / PROCUREMENT / SUBSCRIPTION / PRODUCTION / **REIMBURSEMENT**) is now paid **directly via Razorpay** (per-invoice order + signature verify), confirmation emails fire on raise + payment, attachments upload to Cloudinary, and procurement supports **supplementary invoices** with a **GRN client-visibility gate**.

**WALLET IS FROZEN — not deleted, not called by any new path.**
- `wallet.routes.js`, `wallet.controller.js`, `WalletPanel.jsx` — **unmodified**. The admin wallet panel still works for legacy/rollback.
- `User.wallet.balance` / `User.wallet.dueAmount` fields remain (legacy/rollback) but are **never read or written** by any new flow.
- The client dashboard no longer renders wallet ANYWHERE (header balance, "Wallet & Transactions" drawer item, Pay-Due banner, wallet/transactions modals, `WalletView` — all removed; `loadWallet`/`startRecharge`/`payDue` deleted; no `GET /api/wallet` calls remain). The Razorpay `<script>` (index.html) stays — now used for per-invoice checkout.

**Schema changes (all additive — existing records read as defaults, NO migration):**
- `User.invoices[]`: `type` enum +`REIMBURSEMENT`; +`commission`(0), `notes`(""), `attachmentUrl`(null), `attachmentName`(null), `razorpayOrderId`, `razorpayPaymentId`, `paidAt`, `paidVia` enum `["RAZORPAY","WALLET_LEGACY"]` (new payments ALWAYS write `RAZORPAY`; `WALLET_LEGACY` is for historical records only, never written by new code), `parentInvoiceId` (supplementary→parent), `supplementaryReason`, `indentId` (links a procurement invoice to its source indent so a GRN can find it).
- `delivery_qc` (= the GRN): +`grnGroupId` (one GRN submission = one logical GRN across its item rows), +`linkedInvoiceIds[]`, +`receivedQtyEntered` (bool), +`clientVisibleAt` (date). The client GRN view filters on `clientVisibleAt != null`.
- `ProductionOrder.financials`: +`razorpayOrderId`, `razorpayPaymentId`, `paidVia` (RAZORPAY only for new payments).
- `procurement_logs` enum: +`PROCUREMENT_INVOICE_RAISED`, +`GRN_RECEIVED_UPDATED`.

**Supplementary invoice + GRN client-visibility mechanism (Option A — grouped delivery_qc):**
- Stock Manager raises a PROCUREMENT invoice from an indent (`indentId` stored on the invoice). Later they can raise a **supplementary** invoice (`parentInvoiceId` + required `supplementaryReason`) — parent must exist and belong to the SAME client.
- When the GRN is created (`postGrn`), it generates a `grnGroupId` and looks up every invoice on that client carrying the same `indentId` (parent + supplementaries) → sets `linkedInvoiceIds` on each delivery_qc row.
- A GRN becomes client-visible ONLY when **every linked invoice is PAID AND `receivedQtyEntered === true`**. This is computed by the shared `backend/utils/grnVisibility.js` (`recomputeGrnVisibilityByGroup` / `recomputeGrnVisibilityForInvoice`), called from BOTH the payment-verify path (client) and the GRN update-received path (Stock Manager). **Race-safe:** the visibility stamp is set via an atomic `updateMany` guarded on `{ clientVisibleAt: null }`, so whichever path fires second is a harmless no-op (no "first wins / second errors"; stamped exactly once).

**Email (SendGrid) — `backend/services/email.service.js` (new):** generic `sendEmail({to,subject,html,attachments})` via SendGrid v3 content API + `invoiceRaisedEmailHtml`/`invoicePaidEmailHtml` builders. **Graceful:** no-ops + warns if `SENDGRID_API_KEY`/`EMAIL_FROM` unset; NEVER throws/blocks. Triggers: on raise → email client; on payment → email the raiser (Store Manager for PROCUREMENT via `PROCUREMENT_NOTIFY_EMAIL`, POC otherwise via `POC_NOTIFY_EMAIL`). **Both env keys OPTIONAL** — if unset the raiser email silently no-ops; the invoice still flips PAID. All email is fire-and-forget (`.catch(()=>{})`).

**Cloudinary attachments:** `backend/middleware/uploadInvoiceAttachment.js` (new, multer memory, PDF/DOC/DOCX only, 10MB) + `backend/utils/cloudinaryUpload.js` (new, `uploadInvoiceBuffer` → `folder:"invoices"`, `resource_type:"raw"`; `isValidCloudinaryUrl` guard so arbitrary URLs are rejected before storing). Reuses the existing `config/cloudinary.js`. Upload endpoints: `POST /api/poc/clients/:clientId/invoice-attachment` and `POST /api/stock-manager/invoice-attachment`.

**Razorpay shared helper:** `backend/utils/razorpay.js` (new) — single `createInvoiceOrder()` + `verifyRazorpaySignature()` (HMAC-SHA256 `order_id|payment_id`, constant-time compare). Same credentials as the frozen wallet flow. Every payment path verifies a signature — no invoice flips to PAID without it.

**Endpoints:**
- POC: `POST /clients/:id/invoice` (now creates a Razorpay order + new fields + emails client), `POST /clients/:id/invoice-attachment`, `GET /clients/:id/invoices` (extended fields).
- Stock Manager: `POST /invoice` (procurement, parent or supplementary, Razorpay order, emits `PROCUREMENT_INVOICE_RAISED`, emails client), `POST /invoice-attachment`, `PATCH /grn/:grnId/update-received` (sets received qty/price + `receivedQtyEntered`, recomputes visibility, emits `GRN_RECEIVED_UPDATED`), `GET /invoices` (raised procurement invoices, supplementaries grouped under parents). `postGrn` extended to set `grnGroupId`/`linkedInvoiceIds`/`receivedQtyEntered` + recompute visibility.
- Client: `POST /invoices/:invoiceId/pay-direct` (returns stored razorpayOrderId + amount/commission), `POST /invoices/:invoiceId/verify-payment` (verify sig → PAID/paidVia RAZORPAY, recompute GRN visibility, email raiser), `GET /grns` (visible GRNs grouped, brand-scoped, no LIVE gate). The old wallet `payInvoice` route/handler is replaced.
- Production order: `POST /:id/create-order` (new — Razorpay order for the cost) + `POST /:id/pay` (REWIRED — now verifies signature; the OLD wallet-deduction path is **fully replaced**, `paidVia` always RAZORPAY).

**Frontend:** POC `InvoicingView` redesigned (invoice-style form: type incl. REIMBURSEMENT, commission, notes, attachment upload, price-confirmation guardrail; list shows commission/total/attachment/paidAt). Stock Manager new **"Procurement Invoices"** drawer item (`ProcurementInvoicesView` + `ProcInvoiceForm`: raise from indent, raise supplementary on PAID parents, grouped list, Paid badges). Client `Dashboard.jsx`: wallet fully removed; `InvoicesView` rewritten to pay via Razorpay (pay-direct→checkout→verify), shows commission/total/attachment, grouped supplementaries, "View GRN"; new **"Goods Received Notes"** drawer item (`GrnView`); production banner rewired to Razorpay (create-order→checkout→pay/verify).

**Run-once after deploy (optional env):** `PROCUREMENT_NOTIFY_EMAIL`, `POC_NOTIFY_EMAIL` (raiser-notification recipients — unset = silent no-op). Existing `SENDGRID_API_KEY`/`EMAIL_FROM`/`CLOUDINARY_*`/`RAZORPAY_*` already present. No data migration (additive schema; test client wallet empty).

**Files:** new `backend/services/email.service.js`, `backend/middleware/uploadInvoiceAttachment.js`, `backend/utils/cloudinaryUpload.js`, `backend/utils/razorpay.js`, `backend/utils/grnVisibility.js`; edited `backend/models/user.js`, `deliveryQc.js`, `productionOrder.js`, `procurementLog.js`, `backend/controllers/poc.controller.js` + `routes/poc.routes.js`, `controllers/stockManager.controller.js` + `routes/stockManager.routes.js`, `controllers/client.controller.js` + `routes/client.routes.js`, `controllers/productionOrder.controller.js` + `routes/productionOrder.routes.js`; edited `frontend/src/pages/Dashboard.jsx`, `PocDashboard.jsx`, `StockManager.jsx`.

**Untouched / frozen (verified):** `wallet.routes.js`, `wallet.controller.js`, `WalletPanel.jsx` (NONE modified); `authMiddleware`, `applyStockCascade`, `bomExpander`, `expandItem`, `brand_stocks`/`purchase_register` schemas + FEFO, recipe schemas, signup, nav, footer; Head Chef + Local Kitchen dashboards.

## 25. Feature Log — Manual Order Entry (Local Kitchen) + Client Analytics Reroute (built)

**What it is:** A manual order-capture workflow on the **Local Kitchen** dashboard that fires the stock cascade at the kitchen, plus a **client analytics reroute** so the client's Per-Day / Date-Range views show **Rista + manual orders combined**. This stands in for the (leadership-pending) Rista live integration — orders are entered by hand, no Rista dependency. NEVER touches money (wallet frozen).

**The `orders` collection is now ACTIVE.** The pre-existing `orders` collection (the old wallet-coupled production-request model with the never-advancing state machine) was **REUSED and extended additively** — NOT rebuilt. A `MANUAL_LOCAL` order stream now lives alongside the legacy `WALLET` records in the same collection, separated by a new `entryType` discriminator.

**Definition (founder-confirmed):** **"order" = one dish unit.** A qty-3 entry counts as **3 orders** in every total — both the Local Kitchen today-view summary and the client analytics. Applied consistently.

**Schema (additive only — no migration; existing wallet orders default `entryType:"WALLET"` and still validate):**
- `order.js`: `+entryType` (`WALLET`|`MANUAL_LOCAL`, default `WALLET`, indexed), `+brandName`, `+brandId`, `+branchCode`, `+recipeId`, `+recipeName`, `+qty`, `+unitPrice`, `+totalAmount`, `+source` (`WALK_IN`|`SWIGGY`|`ZOMATO`|`OTHER`), `+timeBucket` (`MORNING`|`AFTERNOON`|`EVENING`|`LATE_NIGHT`), `+orderDate`, `+enteredBy`, `+enteredAt`, `+cascadeApplied` (default true), `+overrideReason`, `+cascadeDeductions[]` (`{itemName,qty,uom,location,stockId}` — records exactly what was debited so a within-window DELETE reverses it precisely). New index `{brandId, branchCode, orderDate}`. A manual order ALSO sets the legacy required `brand` = `brandId` (and `amount` = `totalAmount`) so the existing schema constraints are satisfied.
- `procurementLog.js` enum: `+ORDER_INGESTED`, `+ORDER_REVERSED`.

**Cascade wrapper — `backend/utils/orderCascade.js` (NEW). `applyStockCascade` is NOT imported or modified.** `projection.controller.js#applyStockCascade` is module-private AND read-only (it never mutates). Per founder approval, rather than export/alter the frozen function, this wrapper **replicates** the two LOCAL cascade levels (**BRANCH_KITCHEN → SEMI_FINISHED** at the kitchen's branchCode) using the SAME shared utilities (`extractIngredientsFromBOM`, `aggregateIngredients`, `convertQty`, `escapeRegex`) and mirrors the **already-shipped deduction pattern** from `productionOrder.controller.js` (clamped `$inc` + `TRANSFER_OUT` history). Three exports:
- `previewOrderCascade({brandName,branchCode,recipeId,qty})` — PURE READ. Expands the MainRecipe BOM to raw leaves, sums available SEMI_FINISHED+BRANCH_KITCHEN at the branch, returns `{canFulfil, insufficientItems:[{itemName,currentQty,requiredQty,shortfall,uom}]}`.
- `applyOrderCascade({...,orderId,allowNegative,session})` — MUTATES inside the passed mongoose session. Debits BRANCH_KITCHEN then SEMI_FINISHED, clamped; on `allowNegative` (override) pushes the unmet remainder into BRANCH_KITCHEN going **negative** (so the next closing audit surfaces the variance). Returns the exact `deductions[]`.
- `reverseOrderCascade({deductions,orderId,recipeName,session})` — credits the recorded deductions back (`TRANSFER_IN`) for the DELETE path.

**Local Kitchen backend (`localKitchen.controller.js` + `localKitchen.routes.js`, all `requireRole("LOCAL_KITCHEN")`, branch-scoped to `req.user.branchCode`):**
- `GET /api/local-kitchen/recipes-for-orders?brandName=` → `[{recipeId,recipeName}]` (MainRecipe, exact-brand). Brand-assigned-to-kitchen guard.
- `POST /api/local-kitchen/orders` → validates brand∈kitchen (403 "Brand not served by this kitchen"), qty int≥1, price≥0, source/bucket enums, `orderDate` today…−7 days (400 otherwise). Looks up MainRecipe by `recipeId`+exact brand (404). **Pre-checks `previewOrderCascade`**: if insufficient & not override → **409** `{blocked,reason:"INSUFFICIENT_STOCK",items:[...]}`. Override requires a non-empty `overrideReason`. Inserts the order + `applyOrderCascade` in **ONE mongoose transaction**; `cascadeApplied=false` only when stock was genuinely short. Emits `ORDER_INGESTED`.
- `GET /api/local-kitchen/orders?date=&brandName=` → grouped by recipe + time bucket, with a daily summary `{totalOrders=Σqty, totalRevenue}` and per-entry drill-down.
- `DELETE /api/local-kitchen/orders/:orderId` → only within **30 min** of entry (`ORDER_DELETE_WINDOW_MIN`); reverses the cascade then deletes; emits `ORDER_REVERSED`.

**Local Kitchen frontend (`LocalKitchen.jsx`):** new brand-workspace drawer item **"Order Entry"** (after "Local Stock"). Brand comes from the already-selected workspace brand (no redundant in-form brand dropdown — the dashboard is brand-first). Form: **dish dropdown (no typing)**, qty, unit price, source dropdown, time-bucket dropdown (auto-selected by current time — <11 Morning / 11–16 Afternoon / 16–21 Evening / >21 Late Night — overridable), date picker (today…−7d). 409 → warning modal listing the negative ingredients → "Override & record" requires a reason → resubmits `override:true`. Below: daily summary card + per-recipe/per-bucket table with click-to-expand entries (Delete button on entries <30 min old).

**Client analytics reroute (`client.controller.js`):** `getDailyAnalytics` + `getRangeAnalytics` now **combine** Rista (`computeBrandSalesSummary`, unchanged) **+ manual orders** via new `getManualOrderTotals({brandId,branchCode,start,end})`. Sums (no dedup — different streams; double-entry would be an operational mistake, not a code bug):
- `totalOrders += Σqty`, `totalRevenue += ΣtotalAmount`, `netRevenue += ΣtotalAmount` (manual = no tax).
- `totalTaxes` / `totalDiscounts` — **Rista only**; manual contributes **0** (the chef enters no tax/discount per order).
- `avgOrderValue` recomputed on combined revenue/orders; `avgItemSellingPrice` folds manual qty+revenue into the item average.
- **No frontend change** — the endpoint shape is unchanged; the client sees one unified number, no Rista-vs-manual split.

**KNOWN LIMITATION (dropdown-only recipes):** orders can ONLY be recorded for dishes that already exist as a `MainRecipe` for the brand. A dish sold but not yet added to MainRecipe cannot be recorded. Accepted for this build — recipes are expected to exist before customers order. (Noted in `OrderEntryView` + `localKitchen.controller.js` comments.)

**Files:** edited `backend/models/order.js`, `backend/models/procurementLog.js`, `backend/controllers/localKitchen.controller.js`, `backend/routes/localKitchen.routes.js`, `backend/controllers/client.controller.js`, `frontend/src/pages/LocalKitchen.jsx`; new `backend/utils/orderCascade.js`.

**Untouched / frozen (verified):** `applyStockCascade` (NOT imported or modified — replicated instead), `bomExpander`, `expandItem`, `brand_stocks`/`purchase_register` schemas + FEFO, recipe schemas, `authMiddleware`, signup/nav/footer; ALL wallet code (`wallet.*`, `WalletPanel.jsx`); POC / Head Chef / Stock Manager dashboards; client analytics FRONTEND (endpoint shape preserved).

## 26. Feature Log — Recipe Import via Excel Template (built, Head Chef)

**What it is:** A one-time-per-brand bulk import of MainRecipes, SubRecipes, and ItemMasters from a standardised `.xlsx` template, used during brand onboarding to seed existing recipes into the ERP instead of hand-entering each one. Lives on the **Head Chef** dashboard (`/head-chef`), gated `requireRole("RECIPE_MANAGER")`; the POC operates it by logging into the Head Chef dashboard during onboarding. New **"Recipe Import"** drawer item placed right after "Recipes". Uses the already-selected workspace brand (no redundant in-view brand dropdown — same brand-first pattern as every other Head Chef view).

**Library:** **`exceljs`** (added to `backend/package.json`). `xlsx`/SheetJS was the originally-named standard but was NOT used — exceljs has a cleaner npm supply-chain posture (no equivalent prototype-pollution/ReDoS advisory) and reads+writes `.xlsx`.

**NO schema changes; existing recipe-creation controllers untouched.** The import builds its OWN write logic using the same field shapes as `MainRecipe` / `SubRecipe` / `itemmasters`. Frozen items verified untouched: `authMiddleware`, `applyStockCascade`, `bomExpander`, `expandItem`, `brand_stocks`/`purchase_register` schemas + FEFO, wallet, signup, nav, footer, and the Main/Sub/ItemMaster schemas.

**Template structure (served on-the-fly, never a committed binary):**
- **MainRecipes** sheet: `Recipe Name | Item Name | Unit | Quantity`. One row per ingredient or sub-recipe reference; sub-recipe refs prefixed exactly `SR: `.
- **SubRecipes** sheet: `SubRecipe Name | Item Name | Unit | Quantity | Yield Percent | Batch Yield Qty`. Raw ingredients only (no nested `SR:`).
- **ItemMasters** sheet (optional): `Item Name | Unit | Shelf Life Days | Min Stock Level | Min Stock Uom`.
- Plus a `README` sheet documenting the rules. Generated by `buildTemplateWorkbook()` and streamed from `GET /api/head-chef/recipe-import-template` — so the template can never drift from what the parser expects.

**TWO SCHEMA-DRIVEN DECISIONS (founder-confirmed) — these deviate from the original spec:**
1. **Units restricted to GM / KG / PC only.** `ItemMaster.uom` enum (`KG,GM,PC,NOS,PCS,Pcs`) and `SubRecipe` item `uom` enum (`PC,GM,KG`) do NOT include ML/L, and the schemas are frozen. ML/L on any row is a **blocking error** (clear message telling the user to convert). The original spec listed ML/L — dropped to avoid silent mid-transaction validation failures.
2. **Added a `Batch Yield Qty` column to the SubRecipes sheet.** The cascade scales a sub-recipe by `requestedQty / SubRecipe.yield` (batch output quantity), but the spec's "Yield Percent" is a cooking-yield % (→ stored on each item's `yield`), NOT a batch size. The new column captures the prepared batch output (entered once per sub-recipe, on the first row) → stored on `SubRecipe.yield`. A missing/zero batch yield is a **blocking error** (without it the cascade math is wrong — the whole reason for the column).

**Identity convention honoured (critical):** per `bomExpander.js`, an item's identity is its **`refId`** — INGREDIENT items get `refId = ingredient name` (what the cascade matches against `brand_stocks.itemName`); SUBRECIPE items get `refId = sub-recipe recipeName`. Names are normalised (trim → collapse whitespace → lowercase) for matching, and the **existing DB casing wins** as the canonical `refId` when an item/sub already exists (so imports never fork casing). **Prices are NOT imported** — every `netPrice` is seeded to 0; FCR pricing stays owned by the POC flow (§17/§18). Item `category` defaults to "Food" (template has no category column).

**Endpoints (`headChef.controller.js` + `headChef.routes.js`, all `requireRole("RECIPE_MANAGER")`):**
- `GET /recipe-import-template` — streams the generated `.xlsx`.
- `POST /recipe-import-preview` (multipart, `uploadExcel` middleware) — parses + runs the 3-pass validation with NO DB writes; returns `{ success, brandName, plan:{itemMastersToCreate/AlreadyExist, subRecipesToCreate/Update, mainRecipesToCreate/Update}, warnings[], errors[], confirmationToken }`. Errors block; warnings don't. `confirmationToken` = `sha256(brandName + fileBytes)`, null when there are errors.
- `POST /recipe-import-commit` (multipart) — requires the matching `confirmationToken` (guards that the committed file is the previewed file), re-runs validation, then writes all 3 passes in **one mongoose transaction** (Pass 1 create new ItemMasters / reuse existing untouched → Pass 2 create-or-update SubRecipes by brand+recipeName → Pass 3 create-or-update MainRecipes). Any failure rolls back the entire import. On success emits `RECIPE_IMPORT_RUN` to `procurement_logs` (best-effort, post-commit) and returns `{ created, updated, log }`.

**3-pass validation (`backend/utils/recipeImport.js`, shared by preview + commit):**
- **Pass 1 — ItemMasters:** collect every raw-ingredient name + unit from all sheets; reject inconsistent units for the same name (with sheet+row refs) and any non-GM/KG/PC unit; existing ItemMaster (case-insensitive exact name) reused and never modified; new ones queued (uom from sheet; shelfLife/minStock from the optional ItemMasters sheet else null).
- **Pass 2 — SubRecipes:** group by name; reject `SR:` rows (no nesting), non-positive quantities, out-of-range Yield Percent (1–100, default 100), and missing batch yield; build `items[]` (`type:INGREDIENT, refId:canonicalName, quantity, uom, yield:cookingPct, netPrice:0`); create or **update** (overwrite `items[]` + `yield`) by exact brand+recipeName.
- **Pass 3 — MainRecipes:** group by name; `SR: ` rows → `type:SUBRECIPE, refId:subRecipeName` (must resolve to a sub created this run OR pre-existing for the brand, else blocking error with recipe+row context); other rows → `type:INGREDIENT`; create or update by exact brand+recipeName.
- **Error/warning reporting** includes sheet name, 1-indexed Excel row, recipe/sub context, and a human-readable message (e.g. `"MainRecipes row 12 (recipe 'Chicken Roast'): SR 'Roast Masala' not found in SubRecipes sheet…"`).

**Files:** new `backend/utils/recipeImport.js` (parse + 3-pass engine + template builder + token), `backend/middleware/uploadExcel.js` (multer memory, `.xlsx` only, 5MB, clean 400); edited `backend/controllers/headChef.controller.js` (+3 handlers), `backend/routes/headChef.routes.js` (+3 routes), `backend/models/procurementLog.js` (+`RECIPE_IMPORT_RUN`), `backend/package.json` (+`exceljs`); edited `frontend/src/pages/HeadChef.jsx` (+"Recipe Import" drawer item + `RecipeImportView`: template download, `.xlsx` picker ≤5MB, preview plan/warnings/errors, error-gated green Confirm Import, reminder banner).

**Scope guard:** all endpoints RECIPE_MANAGER-gated; brand validated to exist as a client `User` (`resolveBrandUser`) before any read/write; 5MB cap; memory storage (no disk write); full transaction rollback on commit failure.

**Deferred (still not built):** the Word-SOP → Excel AI extraction step (stage 1 of the original two-stage conversion) — this build covers Excel → DB only.

## 27. Feature Log — Branch Rename: KALYANNAGAR → JAYANAGAR (built)

**SUPERSEDED by §29.** The rename approach described below was reverted before deployment because the business decision changed: Kalyan Nagar remains in the system as a closed-but-present branch, and Jayanagar was added as a new sibling branch instead. The migration script described below was never run and has been deleted. Read §29 for the current state.

**What it is:** A pure rename of the local kitchen previously known internally as **"Kalyan Nagar"** (branchCode `KALYANNAGAR`) to **"Jayanagar"** (branchCode `JAYANAGAR`, display "Jayanagar"). Two parts: a CODE change (display labels, branch lists, the seeded LOCAL_KITCHEN account, `.env`) and a DATA migration script. **No schema, index, or structural change** — branch-code VALUES only.

**Code changed (active files only):**
- Backend display/Rista maps: `client.controller.js` (`BRANCH_DISPLAY` + `RISTA_BRANCH_MAP` `JAYANAGAR: null`), `poc.controller.js` (`BRANCH_DISPLAY`). Comment-only: `localKitchen.controller.js`, `seedAdminUsers.js`, `models/adminUser.js`, `models/subrecipeDispatch.js`.
- Frontend display maps + branch lists: `Dashboard.jsx`, `PocDashboard.jsx`, `StockManager.jsx`, `FridgeAudit.jsx`, `AdminDashboard.jsx`, `ProjectionForm.jsx`, `HeadChef.jsx` (display map + `LOCAL_KITCHENS` array + dispatch-branch dropdown), `LocalKitchen.jsx` (display map + comment).
- `backend/.env`: `ADMIN_LOCALKITCHEN_2_USERNAME` → `jayanagar@skopekitchens.com`, `ADMIN_LOCALKITCHEN_2_BRANCH_CODE` → `JAYANAGAR`. **Production (Render) env must be updated with these same two keys.**
- **Left frozen by design:** `Dashboard.legacy.jsx`, `AdminDashboard.legacy.jsx` (rollback snapshots) and `docs/DECISIONS.md` (historical record) still say "Kalyan Nagar".

**Migration script — `backend/scripts/renameKalyanToJayanagar.js`:** idempotent (filters on OLD value, writes NEW → 2nd run is a no-op); per-collection try/catch with a final matched/modified summary; rollback = swap the OLD/NEW constants (+emails) and re-run. Covers branch-code VALUES in: `brand_stocks`, `subrecipe_dispatches` (`fromBranchCode`+`toBranchCode`), `producer_audits`, `ingredient_indents`, `production_orders`, `procurement_logs` (`metadata.branchCode`/`toBranchCode`/`fromBranchCode`), `menu_entries`, `projections`, `fridge_audits`, `mapped_ingredients`, `orders`, `purchase_register` (data-only — FEFO/schema untouched), `users.assignedBranches[]` (array element via `arrayFilters`), and `admin_users` (branchCode + email, with a guard that skips the email rename if a `jayanagar@…` admin already exists). **Not touched (confirmed no branchCode field):** `stock_updates`, `delivery_qc`. `brand_stocks.location` is an enum (`SEMI_FINISHED`/`BRANCH_KITCHEN`/`WAREHOUSE_*`), not a branch code — not migrated.

**Run order (deploy):** 1) deploy code → 2) `node backend/scripts/renameKalyanToJayanagar.js` (once; verify summary counts) → 3) update the two `.env` keys on Render → 4) restart backend. Re-running `seedAdminUsers.js` is NOT required — the migration renames the existing AdminUser record in place. The Jayanagar kitchen operator logs in with the new email `jayanagar@skopekitchens.com` (same password).

**Known low-risk note:** `branchStoreMapper.js#getAnalyticsBranchCode()` already maps the label `"jayanagar"` → `"JNG"` (legacy Rista store code, CLAUDE.md §8). The new dashboards use `RISTA_BRANCH_MAP` keyed by branchCode (`JAYANAGAR→null`), not the label map, so they are unaffected — left untouched.

**Deferred:** `TESTBRANCH` rename is a separate task scheduled after testing — NOT touched here.

## 28. Feature Log — Client Menu Item Edit + Soft-Delete (built, fixes BUG-001)

**What it is:** The Client menu was create-only (BUG-001 / test C-02 expected create+edit+delete). Clients can now **edit** and **soft-delete** individual menu items. CLIENT-role feature, scoped to the brand's own client.

**Data-model reality (important):** menu items are NOT one-doc-per-item. A `MenuEntry` document holds an `items[]` array of subdocuments, and each submission creates a new `MenuEntry`; the client's on-screen menu is the flattened union of `items` across that branch's entries.

**Schema change — `menuItemSchema` in `backend/models/menuEntry.js` (the ONLY schema touched):**
- `_id` **enabled** (was `{ _id: false }` → now `{ _id: true }`) so each item has a stable ObjectId to target.
- Added `isDeleted: { type: Boolean, default: false }`. Soft-deleted subdocuments are **retained** (not pulled) so nothing referencing them by name/price loses history. No other field added; parent `menuEntrySchema` unchanged.

**New endpoints (`backend/controllers/menuEntry.controller.js`, routes in `backend/routes/menuEntry.routes.js`, mounted at `/api`, `authMiddleware`-gated):**
- `PUT /api/menu-items/:entryId/items/:itemId` (`editMenuItem`) — accepts **ONLY** `recipeName, qty, uom, cost`; any other key → **400**. Brand ownership: entry's `clientId` must equal requester → else **403** (reuses the client read-path scoping). If `recipeName` changes, it must exist as a `MainRecipe` for the client's brand (exact-brand anchored case-insensitive regex `brandExact`, same pattern as localKitchen/headChef) → else **400**. Editing a soft-deleted item → 404.
- `DELETE /api/menu-items/:entryId/items/:itemId` (`softDeleteMenuItem`) — sets `isDeleted: true`, returns **200** (idempotent). Cross-brand → **403**.
- `brandExact` imports `escapeRegex` from `bomExpander.js` (imported only — the protected file is NOT modified).

**Read paths now filter soft-deleted items** via shared `backend/utils/menuVisibility.js` `stripDeletedMenuItems()` (JS filter after `.lean()`, since items is an array). All **five** consumers updated: `client.controller.js getMenu`, `localKitchen.controller.js getMenu`, `headChef.controller.js getMenu`, `poc.controller.js getMenu`, and `menuEntry.controller.js listMenuEntriesForBrand` (recipe-admin incoming queue). The manual order-entry picker reads `MainRecipe`, NOT the menu, so it needed no change. Orders carry their own `recipeName`/price snapshot and do **not** reference menu items, so soft-delete cannot break order history (confirmed).

**Frontend (`frontend/src/pages/Dashboard.jsx`, `HomeView` + the shared Enter-Menu modal):** each menu row gets **Edit** / **Delete** controls. Edit reuses the existing inline modal in **edit-mode** (title "Edit Menu Item", branch selector + add-row + per-row delete hidden, single item, saves via `PUT`). Delete opens a confirmation dialog (black/slate palette, no emojis): *"Are you sure? This item will be hidden from your menu but past orders will be preserved."* The flatten now preserves `entryId` + item `_id` so controls target the exact subdocument. Price stays bound to `cost`.

**Tested (18/18 via a temp harness run against the live DB, then deleted):** create; edit each of recipeName/qty/uom/cost individually then all together; reject unknown field (400); X-02 cross-brand edit + delete (403); recipe-from-another-brand (400); soft-delete (200) + DB flag set + subdoc retained; all five read paths hide the deleted item; edit-soft-deleted (404).

**Follow-ups (logged, intentionally NOT fixed in this PR):**
1. **Field-naming drift** — backend/schema field is `cost`; UI labels it "Selling Price (₹)". Kept as-is per instruction.
2. **Create/edit asymmetry** — edit validates recipe-brand ownership (400); `createMenuEntry` does NOT validate the recipe at all. Do not tighten create in this PR.
3. **No client-action audit logging** — `procurement_logs` is admin/producer-scoped (actor = AdminUser, enum lacks menu/client events); menu edits/deletes are not audited. Not invented here.

## 29. Feature Log — Jayanagar Added as New Branch (supersedes §27)

**What it is:** An **additive** branch change — **Jayanagar** is added as a brand-new local kitchen (branchCode `JAYANAGAR`, display "Jayanagar") **alongside** the existing **Kalyan Nagar** (branchCode `KALYANNAGAR`, display "Kalyan Nagar"), which stays fully present. This **reverts the §27 rename** and replaces it: there is **no rename and no data migration** — both branches now coexist as ordinary siblings.

**Reason (business decision):** Kalyan Nagar is closed for now but may reopen, so it must remain in the system as a fully active branch (no `isActive`/dormant flag — operators simply don't log into it). Jayanagar is a separate new kitchen. The §27 single-branch rename no longer matched reality.

**No DB migration needed / performed.** The §27 migration script (`renameKalyanToJayanagar.js`) **was never run against any database** (verified: `admin_users` still held the original `kalyannagar@`/`KALYANNAGAR` record, and all branch-coded collections had zero `KALYANNAGAR` *and* zero `JAYANAGAR` data). The additive approach requires **no data changes** — only seeding the new Jayanagar admin. The script has been **deleted**.

**Code changes — Part A (revert §27 rename, restore Kalyan Nagar):**
- `backend/controllers/client.controller.js` — restored `KALYANNAGAR: "Kalyan Nagar"` in `BRANCH_DISPLAY` and `KALYANNAGAR: null` in `RISTA_BRANCH_MAP`.
- `backend/controllers/poc.controller.js` — restored `KALYANNAGAR: "Kalyan Nagar"` in `BRANCH_DISPLAY`.
- `backend/.env` — `ADMIN_LOCALKITCHEN_2_*` restored to `kalyannagar@skopekitchens.com` / `KALYANNAGAR` (its pre-§27 value).
- `backend/scripts/seedAdminUsers.js`, `backend/models/adminUser.js`, `backend/models/subrecipeDispatch.js`, `backend/controllers/localKitchen.controller.js` — comment wording restored to mention **both** Kalyan Nagar and Jayanagar (comment-only; no logic). No branchCode enum exists anywhere — `branchCode` is a free `String`, so nothing structural to extend.
- **Deleted** `backend/scripts/renameKalyanToJayanagar.js`.
- Frontend (9 non-legacy files) — restored `KALYANNAGAR`/"Kalyan Nagar" alongside the existing `JAYANAGAR`: `Dashboard.jsx`, `PocDashboard.jsx`, `StockManager.jsx`, `FridgeAudit.jsx`, `AdminDashboard.jsx`, `LocalKitchen.jsx` (BRANCH_DISPLAY maps), `ProjectionForm.jsx` (BRANCH_OPTIONS), `HeadChef.jsx` (BRANCH_DISPLAY + `LOCAL_KITCHENS` array + the dispatch-branch dropdown). Legacy snapshots (`*.legacy.jsx`) left untouched.

**Code changes — Part B (add Jayanagar as new branch):**
- `backend/.env` — added **`ADMIN_LOCALKITCHEN_5_USERNAME=jayanagar@skopekitchens.com`**, **`ADMIN_LOCALKITCHEN_5_PASSWORD=123456`**, **`ADMIN_LOCALKITCHEN_5_BRANCH_CODE=JAYANAGAR`** (slot 5; slot 2 stays Kalyan Nagar, slot 4 is the test kitchen). **Render production `.env` needs these same three keys added.**
- `backend/scripts/seedAdminUsers.js` — no structural change: the LOCAL_KITCHEN seed is a contiguous env-loop (`ADMIN_LOCALKITCHEN_<n>_*`), so slot 5 is picked up automatically and upserted by email (additive — existing admins untouched).
- `backend/controllers/client.controller.js` + `poc.controller.js` — `JAYANAGAR: "Jayanagar"` in `BRANCH_DISPLAY`, `JAYANAGAR: null` in `RISTA_BRANCH_MAP` (no Rista POS for Jayanagar). Both branches now present in every map.
- Frontend — `JAYANAGAR`/"Jayanagar" present alongside `KALYANNAGAR` in the same 9 files.
- `backend/utils/branchStoreMapper.js` — unchanged; its legacy label map already has `"jayanagar" → "JNG"` and never had a `kalyannagar` key.
- No `.env.example` exists in the repo, so there was nothing to mirror.

**Operational note:** From the system's perspective **both kitchens are fully functional** — both have a LOCAL_KITCHEN login, both render in every branch picker, both can receive dispatches and hold stock. Nothing in the code disables Kalyan Nagar; operators simply choose not to use it while it's closed.

**Run-once after deploy:** add the three `.env` keys (dev done; Render pending) and run `node backend/scripts/seedAdminUsers.js` (idempotent upsert-by-email) so the Jayanagar admin exists. Kalyan Nagar's existing admin is unaffected.

## 30. Production Projection Review Exposed on New Head Chef Dashboard (BUG-004) (fixed)

**The bug:** clients' submitted projections were stuck at `PENDING_CHEF_REVIEW` forever. The only UI path that could flip a projection to `CHEF_CONFIRMED` (review → net requirements → stock check → indent request → confirm → `ProductionOrder` written) was `BrandDrawer.jsx`'s "Production Projection" button on the **legacy `AdminDashboard.jsx`** — the new `/head-chef` dashboard's Menu & Projections tab only ever showed projection status as read-only text, with no way to act on it. Separately, `getPendingProjections` (`projection.controller.js`) silently filtered by `req.user.branchCode` for any `RECIPE_MANAGER` caller — so even with an entry point added, a Head Chef would only ever see pending projections submitted from their own seeded branch, not from other branches' clients.

**The fix (two parts, landed together):**
- **Entry point added, not rebuilt.** `HeadChef.jsx`'s Menu & Projections tab (`MenuProjectionsView`) now renders a small `btnGhost`-styled "Review" button next to any projection row with `status === "PENDING_CHEF_REVIEW"` (same subdued, per-row-conditional convention already used elsewhere in this file, e.g. "Raise indent" in Reorder Insights). Clicking it calls `navigate('/admin/projection/${clientId}')` — the exact same route, component (`ProjectionReview.jsx`), and param (`brand._id`/`clientId`) that `BrandDrawer.jsx`'s legacy button already uses. `MenuProjectionsView` now also receives `clientId` as a prop (previously only `brandName`) since the route needs the client's `User._id`. Rows in any other status are unchanged — plain text only, no button. No route guard exists at the React Router level (`App.jsx` has no role-wrapper); access is enforced entirely by the backend, and `ProjectionReview.jsx`'s API calls (`/api/projections/pending`, `/:id/net-requirements`, `/:id/convert`) were already `requireRole("RECIPE_MANAGER")`-gated, so no routing change was needed — the page was always reachable from a Head Chef session, it just had no link pointing to it.
- **Branch filter removed.** `getPendingProjections` (`projection.controller.js`) no longer adds `q.branchCode = req.user.branchCode` for `RECIPE_MANAGER` callers. The route's own doc comment already said "views all projections awaiting chef review... across brands" — the branch restriction contradicted that. Verified via grep: the endpoint's only caller anywhere in the frontend is `ProjectionReview.jsx` (`GET /api/projections/pending?brandId=...`), which already scopes to one brand via the `brandId` query param — nothing depended on the branch-scoped behavior, so no flag/compat parameter was needed.

**What was NOT changed:** `ProjectionReview.jsx` (the legacy review screen — net requirements, stock-cascade check, indent raising, the Confirm action, `convertProjectionToProductionOrder`), `getNetRequirements`, `getProductionPlan`, `BrandDrawer.jsx`, the legacy `AdminDashboard.jsx` review path, and every schema (`Projection`, `ProductionOrder`, `ingredient_indents`). `expandItem()`, `bomExpander.js`, `applyStockCascade`, `brand_stocks`, and `authMiddleware` were read-only references, never touched.

**Why this approach:** the founder's instruction was to reuse the already-working legacy flow rather than build new review UI inside `/head-chef` — minimal-surface fix, lowest risk to a flow that already works correctly end-to-end.

**Known follow-up (flagged, not fixed here — out of scope per founder instruction):** `ProjectionReview.jsx` itself does not display the source branch name anywhere on screen (neither the multi-projection picker nor the single-projection detail view) — a chef clicking Confirm there has no in-screen way to tell which branch's stock and indents the action affects. The branch is visible one screen earlier, on `HeadChef.jsx`'s Menu & Projections row (next to the new Review button), but is not carried into the review screen itself. Track for a future small addition to `ProjectionReview.jsx` (e.g. a header line resolving `brandId`/`projection.branchCode` to a display name) — explicitly not touched in this fix since `ProjectionReview.jsx` was protected/out-of-scope.

**Files involved:** `frontend/src/pages/HeadChef.jsx` (Menu & Projections tab — Review button + `clientId` prop), `backend/controllers/projection.controller.js` (`getPendingProjections` — branch filter removed).

## graphify

This project has a nodesify-graphify knowledge graph at .graphify/.

Rules:
- MUST read .graphify/graph_report.md before searching files for architecture or codebase questions
- MUST use `nodesify-graphify query "<question>"`, `nodesify-graphify path "<A>" "<B>"`, or `nodesify-graphify explain "<concept>"` for cross-module questions — do NOT grep/read files directly for these
- After modifying code files in this session, run `nodesify-graphify update .` to keep the graph current
