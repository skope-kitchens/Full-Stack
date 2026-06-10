# Bug Fix Log

## FCR Costing Engine — `backend/controllers/costing.controller.js`
**Date:** 2026-06-03

### Bug 1 — `wastagePercent` parameter ignored
- **What was wrong:** The `calculateFoodCost` endpoint accepted `wastagePercent` from the request body but always hardcoded 5% in the formula. The passed value was silently thrown away.
- **Fix:** Changed default from `0` to `5`, added `Math.max(0, Number(wastagePercent)) / 100` so the actual value is used.

### Bug 2 — Selling price never calculated
- **What was wrong:** The documented formula requires `Suggested Selling Price = Total Cost ÷ 0.32` (to hit ~32% FCR target), but neither the single-recipe endpoint nor the summary endpoint returned this value.
- **Fix:** Added `suggestedSellingPrice: round(total / 0.32)` to the response of both `calculateFoodCost` and `calculateRecipe` (summary). Also piped it through the `getSummary` push.

### New bugs identified (not yet fixed)
1. `getSummary` runs full cost expansion for every recipe in a loop — no pagination, will time out on large brands.
2. `calculateRecipe` (used by summary) fetches by `_id` directly — bypasses brand ownership check.
3. `wastagePercent` has no upper bound — could accept absurd values like 9999.

---

## Recipe Type Field — Trial, Training, Final Recipe Pages
**Date:** 2026-06-04

### Bug 1 — `recipeType` not saved to database
- **What was wrong:** The Recipe Type dropdown (Main/Sub) existed on all three recipe pages but the value was never stored. Both Mongoose schemas (`trialRecipe.models.js`, `trainingRecipe.models.js`) were missing the field entirely, and both controller functions in `trialTrainingRecipes.controller.js` ignored `recipeType` from the request body.
- **Fix:** Added `recipeType: { type: String, enum: ["MAIN", "SUB"], default: "MAIN" }` to both schemas. Updated `createTrialRecipe` and `createTrainingRecipe` controllers to destructure and persist `recipeType`. Backward compat: old records with no field are treated as MAIN everywhere.

### Bug 2 — Sub recipes appearing in Main recipe name dropdown
- **What was wrong:** The `loadTrainingNames` useEffect in `AddRecipe.jsx` fetched all TR3 training recipes without filtering by `recipeType`, so SUB-type training recipes appeared in the MAIN dropdown and vice versa.
- **Fix:** Added `.filter()` in the useEffect to match `r.recipeType === recipeType` (with fallback `r.recipeType || "MAIN"` for old records). Also added `recipeType` to the dependency array so the list refreshes when the user switches type.

### Bug 3 — Sub recipe `yield` always saved as 0
- **What was wrong:** `AddRecipe.jsx` had no state for sub recipe batch yield, and `subrecipe.controller.js` did not read `yield` from the request body.
- **Fix:** Added `subYield` state in `AddRecipe.jsx`, Batch Yield input shown when type is SUB, payload sends `yield: subYield`. Controller updated to `const { brand, recipeName, items, yield: recipeYield } = req.body` and saves `yield: Number(recipeYield) || 0`.

### Bug 4 — Sub recipe ingredient prefill completely blocked
- **What was wrong:** The prefill useEffect in `AddRecipe.jsx` had a guard on line 106: `if (recipeType !== "MAIN") return;` — this caused the effect to exit immediately for Sub recipes, so ingredients were never fetched from the TR3 training record even though the name dropdown populated correctly.
- **Fix:** Removed that single guard line. The rest of the prefill logic (find TR3 by recipeName, copy items) works correctly for both MAIN and SUB.

---

## Menu Entry Delete — BrandDrawer
**Date:** 2026-06-04

### Bug — Old menu entries accumulate with no way to remove them
- **What was wrong:** No delete functionality existed. Menu entries submitted by clients stayed in the database forever, cluttering the Recipe Manager's BrandDrawer view.
- **Fix:**
  - Added `deleteMenuEntry` controller in `menuEntry.controller.js` — finds by `_id` and hard-deletes.
  - Added `DELETE /api/admin/menu-entries/:entryId` route in `menuEntry.routes.js`, locked to `RECIPE_MANAGER`.
  - Added `handleDeleteMenu` handler and a Delete button on each menu entry card in `BrandDrawer.jsx`. Optimistic UI: removes entry from local state immediately on success.

---

## PENDING INVESTIGATION — Yield not applied in FCR calculation
**Date flagged:** 2026-06-03
**Status:** Needs clarification from founder before fixing

### What was found
- The `yield` field exists in the `MainRecipe` item schema and is shown in the recipe creation UI (`RecipeItem.jsx`)
- The documented formula says: `Net Price = Unit Price ÷ Yield%`
- But `calculateCost()` in `costing.controller.js` ignores `yield` entirely — it only uses `quantity` and `netPrice`
- The `RecipeItem.jsx` UI preview (`calculateTotal`) also ignores `yield`
- Yield is stored as metadata but **never applied anywhere in calculations**

### Why it's blocked
It's unclear how recipe managers currently enter `netPrice`:
- If they enter the **raw item master price** → yield must be applied in the engine (`÷ yield%`)
- If they enter an **already yield-adjusted price** → yield is pre-baked; applying it again would double-count and inflate all costs

### Files involved
- `backend/controllers/costing.controller.js` — `calculateCost()` function
- `frontend/src/components/RecipeItem.jsx` — `calculateTotal()` UI preview function

### Next step
Ask the recipe manager how they enter `netPrice` in the recipe form, then apply the fix to both files.
