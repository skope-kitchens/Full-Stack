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
- ALWAYS read `graphify-out/GRAPH_REPORT.md` before touching anything
- This is your map of the entire codebase — always consult it first
- After making any code changes, run `graphify update .` to keep it current
- For finding how things connect, use `graphify query "<question>"` instead of searching files blindly

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

**P0 — Production Crash Risk (Fix First)**
- Circular reference in recipe expansion — expandItem() in costing.controller.js and admin.recipes.controller.js has NO circular reference protection. Circular sub-recipe references confirmed in production data. Any expansion on a circular recipe CRASHES the Node.js process.

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
- `expandItem()` — Hotspot in recipe/BOM logic. Changes here have wide impact. Currently has circular reference crash bug.
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
- Circular reference protection in costing + admin expansion
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

