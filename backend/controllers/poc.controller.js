/**
 * poc.controller.js — POC (Point of Contact) dashboard.
 *
 * The POC is a Skope-internal role. TWO POCs share ONE login and manage EVERY
 * client from the one dashboard (no per-POC client subsets). The POC owns the
 * operational data the client views read-only: onboarding tasks, daily stock,
 * FCR ingredient costs, SOP links, branch assignment, invoice triggering,
 * client-type flag, procurement mode, and go-live.
 *
 * HARD RULE — money is FROZEN. The POC NEVER touches wallet balance, dueAmount,
 * GST, dues, or Razorpay. Invoices here are append-only UNPAID *records*; the
 * existing frozen wallet flow settles them when the client pays.
 *
 * Every endpoint is gated by requireRole("POC") at the route layer; each handler
 * additionally validates the target client exists and (where relevant) that a
 * branchCode is within that client's assignedBranches.
 */
import User from "../models/user.js";
import MenuEntry from "../models/menuEntry.js";
import { stripDeletedMenuItems } from "../utils/menuVisibility.js";
import Projection from "../models/projection.js";
import StockUpdate from "../models/stockUpdate.js";
import BrandServiceChecklist from "../models/brandServiceChecklist.js";
import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import TrialRecipe from "../models/trialRecipe.models.js";
import TrainingRecipe from "../models/trainingRecipe.models.js";
import FcrConfirmation from "../models/fcrConfirmation.js";
import IngredientListToPoc from "../models/ingredientListToPoc.js";
import { MASTER_SERVICES } from "../utils/masterServices.js";
import {
  extractIngredientsFromBOM,
  aggregateIngredients,
  escapeRegex,
  normalizeUom,
} from "../utils/bomExpander.js";
import {
  getFcrSummary as svcGetFcrSummary,
  getProductionStatus,
  getWarehouseStock,
  getLocalKitchenStock,
} from "../services/pocData.service.js";
import { createInvoiceOrder } from "../utils/razorpay.js";
import { uploadInvoiceBuffer, isValidCloudinaryUrl } from "../utils/cloudinaryUpload.js";
import {
  sendEmail,
  invoiceRaisedEmailHtml,
} from "../services/email.service.js";

/* ============================================================
 * Constants & helpers
 * ========================================================== */

// The branch codes a client can be assigned to (matches client.controller).
const BRANCH_DISPLAY = {
  JPNAGAR: "Main Kitchen",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
  JAYANAGAR: "Jayanagar",
};
const KNOWN_BRANCHES = Object.keys(BRANCH_DISPLAY);

// phase param (TRIAL|TRAINING) → User.procurement key + phase recipe model.
const PHASES = {
  TRIAL: { key: "trial", Model: TrialRecipe, label: "Trial" },
  TRAINING: { key: "training", Model: TrainingRecipe, label: "Training" },
};

// Anchored, case-insensitive EXACT brand match. Used for every brand-scoped
// WRITE so one client's price entry can never touch another brand's recipes.
const brandExact = (brandName) => new RegExp(`^${escapeRegex(brandName)}$`, "i");

// Fetch a client User by id and confirm it is actually a client (brandName set).
// Returns the lean doc, or writes a 404/400 and returns null.
async function loadClient(req, res, select) {
  const { clientId } = req.params;
  if (!clientId || !/^[0-9a-fA-F]{24}$/.test(clientId)) {
    res.status(400).json({ message: "Invalid client id" });
    return null;
  }
  // Always pull brandName for the existence check below, regardless of what
  // the caller's projection asked for — otherwise a select string that omits
  // brandName (e.g. "_id" or "lifecycleStage") makes a real client look 404.
  const projection = select ? `${select} brandName` : "brandName";
  const client = await User.findById(clientId).select(projection).lean();
  if (!client || !client.brandName) {
    res.status(404).json({ message: "Client not found" });
    return null;
  }
  return client;
}

function onboardingPercent(services) {
  const total = Array.isArray(services) ? services.length : 0;
  if (!total) return 0; // no checklist yet → 0%, never divide by zero
  const done = services.filter((s) => s.completed).length;
  return Math.round((done / total) * 100);
}

// Ensure a checklist exists for this client and contains every master service.
// Mirrors the existing admin.brand.routes create-if-missing / add-missing logic.
async function ensureChecklist(brandId) {
  let checklist = await BrandServiceChecklist.findOne({ brandId });
  if (!checklist) {
    checklist = await BrandServiceChecklist.create({
      brandId,
      services: MASTER_SERVICES.map((name) => ({ name })),
    });
    return checklist;
  }
  const existing = checklist.services.map((s) => s.name);
  const missing = MASTER_SERVICES.filter((n) => !existing.includes(n)).map((name) => ({ name }));
  if (missing.length) {
    checklist.services.push(...missing);
    await checklist.save();
  }
  return checklist;
}

/* ============================================================
 * 1. Client list + workspace header
 * ========================================================== */

export async function listClients(req, res) {
  try {
    const { search, stage } = req.query || {};

    const q = { brandName: { $exists: true, $nin: [null, ""] } };
    if (stage && ["AWAITING_MENU", "IN_TRIAL", "LIVE"].includes(stage)) {
      q.lifecycleStage = stage;
    }
    if (search && String(search).trim()) {
      const re = new RegExp(escapeRegex(String(search).trim()), "i");
      q.$or = [{ brandName: re }, { name: re }, { email: re }];
    }

    const clients = await User.find(q)
      .select("brandName name email logoUrl lifecycleStage assignedBranches clientType")
      .sort({ createdAt: -1 })
      .lean();

    // One query for all checklists, then map for O(1) percent lookup.
    const ids = clients.map((c) => c._id);
    const checklists = await BrandServiceChecklist.find({ brandId: { $in: ids } })
      .select("brandId services")
      .lean();
    const pctById = new Map(
      checklists.map((cl) => [String(cl.brandId), onboardingPercent(cl.services)])
    );

    const data = clients.map((c) => ({
      clientId: String(c._id),
      brandName: c.brandName || "",
      company: c.name || "",
      logoUrl: c.logoUrl || "",
      lifecycleStage: c.lifecycleStage || "AWAITING_MENU",
      onboardingPercent: pctById.get(String(c._id)) || 0,
      assignedBranches: c.assignedBranches || [],
      clientType: c.clientType || "B2C",
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[POC] listClients error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load clients" });
  }
}

export async function getClientHeader(req, res) {
  try {
    const client = await loadClient(
      req,
      res,
      "brandName name email phoneNumber logoUrl lifecycleStage assignedBranches clientType procurement"
    );
    if (!client) return;

    const checklist = await BrandServiceChecklist.findOne({ brandId: client._id })
      .select("services")
      .lean();
    const services = checklist?.services || [];

    return res.json({
      clientId: String(client._id),
      brandName: client.brandName || "",
      company: client.name || "",
      email: client.email || "",
      mobile: client.phoneNumber || "",
      logoUrl: client.logoUrl || "",
      lifecycleStage: client.lifecycleStage || "AWAITING_MENU",
      clientType: client.clientType || "B2C",
      assignedBranches: (client.assignedBranches || []).map((code) => ({
        branchCode: code,
        displayName: BRANCH_DISPLAY[code] || code,
      })),
      onboarding: {
        percent: onboardingPercent(services),
        completed: services.filter((s) => s.completed).length,
        total: services.length,
      },
      procurement: {
        trial: {
          mode: client.procurement?.trial?.mode || "SKOPE_PROCURES",
          listSentAt: client.procurement?.trial?.listSentAt || null,
        },
        training: {
          mode: client.procurement?.training?.mode || "SKOPE_PROCURES",
          listSentAt: client.procurement?.training?.listSentAt || null,
        },
      },
    });
  } catch (err) {
    console.error("[POC] getClientHeader error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load client" });
  }
}

/* ============================================================
 * 2. Onboarding status (writer) — reuses BrandServiceChecklist
 * ========================================================== */

export async function getOnboarding(req, res) {
  try {
    const client = await loadClient(req, res, "lifecycleStage");
    if (!client) return;

    const checklist = await ensureChecklist(client._id);
    const tasks = checklist.services.map((s) => ({
      taskName: s.name,
      status: s.completed ? "COMPLETED" : "PENDING",
      completedAt: s.completedAt || null,
    }));

    return res.json({
      lifecycleStage: client.lifecycleStage || "AWAITING_MENU",
      percent: onboardingPercent(checklist.services),
      tasks,
    });
  } catch (err) {
    console.error("[POC] getOnboarding error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load onboarding status" });
  }
}

export async function patchOnboardingTask(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { taskName, status } = req.body || {};
    const name = typeof taskName === "string" ? taskName.trim() : "";
    if (!name) return res.status(400).json({ message: "taskName is required" });
    if (!["COMPLETED", "PENDING"].includes(status)) {
      return res.status(400).json({ message: "status must be COMPLETED or PENDING" });
    }

    const checklist = await ensureChecklist(client._id);
    const service = checklist.services.find((s) => s.name === name);
    if (!service) return res.status(404).json({ message: "Task not found" });

    const completed = status === "COMPLETED";
    service.completed = completed;
    service.completedAt = completed ? new Date() : null;
    await checklist.save();

    return res.json({ success: true, percent: onboardingPercent(checklist.services) });
  } catch (err) {
    console.error("[POC] patchOnboardingTask error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update onboarding task" });
  }
}

// Adds a custom task to THIS client's checklist only. Not added to
// MASTER_SERVICES — new clients still seed with the original 15 untouched.
export async function postOnboardingTask(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { taskName } = req.body || {};
    const name = typeof taskName === "string" ? taskName.trim() : "";
    if (!name) return res.status(400).json({ message: "taskName is required" });

    const checklist = await ensureChecklist(client._id);
    const dup = checklist.services.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (dup) return res.status(400).json({ message: "Task already exists" });

    checklist.services.push({ name });
    await checklist.save();

    const tasks = checklist.services.map((s) => ({
      taskName: s.name,
      status: s.completed ? "COMPLETED" : "PENDING",
      completedAt: s.completedAt || null,
    }));
    return res.json({ success: true, percent: onboardingPercent(checklist.services), tasks });
  } catch (err) {
    console.error("[POC] postOnboardingTask error:", err?.message || err);
    return res.status(500).json({ message: "Failed to add onboarding task" });
  }
}

// Removes a task from THIS client's checklist only — permanent, no undo,
// allowed even if the task was COMPLETED. The 15 MASTER_SERVICES are not
// protected — any task, original or custom, can be removed here.
export async function deleteOnboardingTask(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { taskName } = req.body || {};
    const name = typeof taskName === "string" ? taskName.trim() : "";
    if (!name) return res.status(400).json({ message: "taskName is required" });

    const checklist = await ensureChecklist(client._id);
    const before = checklist.services.length;
    checklist.services = checklist.services.filter(
      (s) => s.name.toLowerCase() !== name.toLowerCase()
    );
    if (checklist.services.length === before) {
      return res.status(404).json({ message: "Task not found" });
    }
    await checklist.save();

    const tasks = checklist.services.map((s) => ({
      taskName: s.name,
      status: s.completed ? "COMPLETED" : "PENDING",
      completedAt: s.completedAt || null,
    }));
    return res.json({ success: true, percent: onboardingPercent(checklist.services), tasks });
  } catch (err) {
    console.error("[POC] deleteOnboardingTask error:", err?.message || err);
    return res.status(500).json({ message: "Failed to remove onboarding task" });
  }
}

/* ============================================================
 * 3. Daily Stock (writer) — reuses the stock_updates / StockUpdate shape.
 * Brand-wide (stock_updates is keyed { brandId, date }, not branch-scoped),
 * so there is NO branch dropdown here — matching the Client Dashboard.
 * Writes only stock_updates (the audit layer the client reads). We do NOT
 * touch brand_stocks here — the trial-phase daily stock is audit-only and the
 * brand_stocks ledger is P1-sensitive.
 * ========================================================== */

function sanitizeStockItem(row) {
  const itemName = String(row?.itemName || "").trim();
  const uom = String(row?.uom || "").trim();
  const nums = {
    issueQty: Number(row?.issueQty),
    usedQty: Number(row?.usedQty),
    wastageQty: Number(row?.wastageQty),
    remainingQty: Number(row?.remainingQty),
  };
  if (!itemName || !uom) return null;
  if (Object.values(nums).some((n) => !Number.isFinite(n) || n < 0)) return null;
  return { itemName, uom, ...nums };
}

export async function postDailyStock(req, res) {
  try {
    const client = await loadClient(req, res, "brandName");
    if (!client) return;

    const { date, items } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    }
    const dateObj = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(dateObj.getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const cleaned = (Array.isArray(items) ? items : []).map(sanitizeStockItem).filter(Boolean);
    if (cleaned.length === 0) {
      return res.status(400).json({ message: "At least one valid item is required" });
    }

    // Pin to correctionSeq 0 (the primary daily record). The stock_updates unique
    // index is now { brandId, date, correctionSeq }; pinning keeps this upsert from
    // ever matching a Stock Manager closing-stock correction record (seq 1+).
    const doc = await StockUpdate.findOneAndUpdate(
      { brandId: client._id, date: dateObj, correctionSeq: 0 },
      { $set: { brandName: String(client.brandName).trim(), items: cleaned } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: { _id: doc._id, date, items: doc.items } });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Stock for this brand/date already exists" });
    }
    console.error("[POC] postDailyStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save daily stock" });
  }
}

export async function getDailyStock(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { date } = req.query || {};
    const q = { brandId: client._id };
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "date must be YYYY-MM-DD" });
      }
      q.date = new Date(`${date}T00:00:00.000Z`);
    }

    const list = await StockUpdate.find(q).sort({ date: -1 }).lean();
    const data = (list || []).map((d) => ({
      _id: d._id,
      date: new Date(d.date).toISOString().slice(0, 10),
      items: d.items || [],
    }));
    return res.json({ success: true, brandWide: true, data });
  } catch (err) {
    console.error("[POC] getDailyStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load daily stock" });
  }
}

/* ============================================================
 * 4. FCR ingredient costs — BRAND-SCOPED + PHASE-SCOPED.
 *
 * The client-visible FCR (computeBrandFcrSummary → calculateRecipe → expandItem)
 * reads netPrice off MainRecipe/SubRecipe items, filtered by the brand. The
 * trial_recipes / training_recipes collections are SEPARATE and are NOT read by
 * that engine. So to make the client's FCR actually move, the price write MUST
 * land on the brand's Main/Sub items. We therefore write the price to:
 *   - the phase collection (TrialRecipe | TrainingRecipe) for the brand, AND
 *   - the brand's MainRecipe + SubRecipe items
 * all filtered by an EXACT brand match so no other brand is ever touched.
 *
 * netPrice = unitPrice / (yieldPercent/100)  (the existing §9 costing formula;
 * the engine uses netPrice directly, so the yield adjustment is baked in here).
 * ========================================================== */

// Aggregate the brand's INGREDIENT items (phase recipes + main/sub) by refId+uom.
async function collectBrandIngredients(brandName, PhaseModel) {
  const brandRe = brandExact(brandName);
  const [mains, subs, phase] = await Promise.all([
    MainRecipe.find({ brand: brandRe }).select("items").lean(),
    SubRecipe.find({ brand: brandRe }).select("items").lean(),
    PhaseModel.find({ brand: brandRe }).select("items").lean(),
  ]);

  const map = new Map();
  const ingest = (recipes) => {
    for (const r of recipes) {
      for (const it of r.items || []) {
        if (it.type !== "INGREDIENT") continue;
        const itemName = String(it.refId || "").trim();
        if (!itemName) continue;
        const uom = normalizeUom(it.uom);
        const key = `${itemName.toLowerCase()}||${uom}`;
        if (!map.has(key)) {
          map.set(key, {
            itemName,
            uom,
            spec: it.specification || it.itemBrand || "",
            yieldPercent: Number(it.yield) > 0 ? Number(it.yield) : 100,
            netPrice: Number(it.netPrice || 0),
          });
        }
      }
    }
  };
  ingest(mains);
  ingest(subs);
  ingest(phase);

  return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export async function getFcrItems(req, res) {
  try {
    const client = await loadClient(req, res, "brandName");
    if (!client) return;

    const phaseKey = String(req.query?.phase || "").toUpperCase();
    const phase = PHASES[phaseKey];
    if (!phase) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });

    const items = await collectBrandIngredients(client.brandName, phase.Model);
    // Surface a back-computed unit price for the standardized form display.
    const data = items.map((i) => ({
      ...i,
      unitPrice: Number((i.netPrice * (i.yieldPercent / 100)).toFixed(4)),
    }));
    return res.json({ success: true, phase: phaseKey, brandWide: true, items: data });
  } catch (err) {
    console.error("[POC] getFcrItems error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR items" });
  }
}

// Phase → which Model + which code field holds the iteration selector.
// FINAL has no code field (single document per dish) and writes to MainRecipe
// only (the dish's own item list — not the shared SubRecipe collection, since
// a sub-recipe isn't owned by one dish).
const ITERATION_TARGETS = {
  TRIAL: { Model: TrialRecipe, codeField: "trialCode", key: "trial" },
  TRAINING: { Model: TrainingRecipe, codeField: "trainingCode", key: "training" },
  FINAL: { Model: MainRecipe, codeField: null, key: null },
};

// Price entry is now scoped to ONE specific iteration document (brand +
// recipeName + phase + code), never a blanket update across every doc that
// happens to carry the ingredient. This is the fix: a TRIAL write touches
// only that one TrialRecipe doc; a FINAL write touches only that one
// MainRecipe doc. No simultaneous cross-collection write ever happens.
export async function postFcrItem(req, res) {
  try {
    const client = await loadClient(req, res, "brandName procurement");
    if (!client) return;

    const {
      phase: phaseRaw,
      recipeName,
      code,
      refId,
      uom,
      unitPrice,
      yieldPercent,
      source: sourceRaw,
      subRecipeName,
      subRecipeBrand,
    } = req.body || {};
    const source = String(sourceRaw || "ITERATION").toUpperCase();
    if (!["ITERATION", "SUBRECIPE"].includes(source)) {
      return res.status(400).json({ message: "source must be ITERATION or SUBRECIPE" });
    }

    const phaseKey = String(phaseRaw || "").toUpperCase();
    const target = ITERATION_TARGETS[phaseKey];
    if (!target) return res.status(400).json({ message: "phase must be TRIAL, TRAINING, or FINAL" });

    const dishName = String(recipeName || "").trim();
    if (!dishName) return res.status(400).json({ message: "recipeName is required" });

    if (target.codeField) {
      const validCodes = phaseKey === "TRIAL" ? ["T1", "T2", "T3"] : ["TR1", "TR2", "TR3"];
      if (!validCodes.includes(code)) {
        return res.status(400).json({ message: `code must be one of ${validCodes.join(", ")}` });
      }
    }

    const name = String(refId || "").trim();
    if (!name) return res.status(400).json({ message: "refId (ingredient) is required" });

    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "unitPrice must be a non-negative number" });
    }
    let yld = Number(yieldPercent);
    if (!Number.isFinite(yld) || yld <= 0) yld = 100; // default 100% (no yield loss)

    // Procurement sequencing (TRIAL/TRAINING only): on CLIENT_PROCURES the
    // ingredient list must be sent first; prices entered only after purchase.
    if (target.key) {
      const procPhase = client.procurement?.[target.key] || {};
      if (procPhase.mode === "CLIENT_PROCURES" && !procPhase.listSentAt) {
        return res.status(409).json({
          message:
            "This phase is set to CLIENT_PROCURES. Send the ingredient list to the client first, then enter prices after they purchase.",
        });
      }
    }

    const netPrice = Number((price / (yld / 100)).toFixed(4));
    const cleanUom = normalizeUom(uom);

    const arrayFilters = [
      { "elem.type": "INGREDIENT", "elem.refId": name, ...(cleanUom ? { "elem.uom": cleanUom } : {}) },
    ];
    const set = { "items.$[elem].netPrice": netPrice, "items.$[elem].yield": yld };

    let modified = 0;
    if (source === "SUBRECIPE") {
      // Ingredients nested inside a sub-recipe live on the shared (brand-wide,
      // cross-iteration) SubRecipe document — same place expandItem()/
      // resolveSubRecipe() already reads them from. Pricing one updates the
      // sub-recipe's computed cost everywhere it's used, exactly like the
      // rest of the BOM — never a per-iteration override.
      const subName = String(subRecipeName || "").trim();
      if (!subName) return res.status(400).json({ message: "subRecipeName is required for source SUBRECIPE" });
      const subBrandRe = brandExact(subRecipeBrand || client.brandName);
      const subNameRe = new RegExp(`^${escapeRegex(subName)}$`, "i");
      const result = await SubRecipe.updateOne(
        {
          brand: subBrandRe,
          recipeName: subNameRe,
          "items.type": "INGREDIENT",
          "items.refId": name,
          ...(cleanUom ? { "items.uom": cleanUom } : {}),
        },
        { $set: set },
        { arrayFilters }
      );
      modified = result.modifiedCount || 0;
    } else {
      // Brand-scoped + dish-scoped + iteration-scoped write. Exact brand AND
      // exact recipeName match → never cross-brand, never cross-dish, never
      // cross-iteration.
      const brandRe = brandExact(client.brandName);
      const nameRe = new RegExp(`^${escapeRegex(dishName)}$`, "i");
      const baseFilter = {
        brand: brandRe,
        recipeName: nameRe,
        "items.type": "INGREDIENT",
        "items.refId": name,
      };
      if (target.codeField) baseFilter[target.codeField] = code;
      if (cleanUom) baseFilter["items.uom"] = cleanUom;

      const result = await target.Model.updateOne(baseFilter, { $set: set }, { arrayFilters });
      modified = result.modifiedCount || 0;
    }

    // Auto-un-confirm: a price edit on an already-confirmed iteration must
    // force a re-confirm so the client never sees stale-confirmed data. (Only
    // un-confirms the iteration currently being viewed — a SUBRECIPE-sourced
    // edit may also affect other dishes/iterations sharing that sub-recipe;
    // those are not auto-un-confirmed here.)
    if (modified > 0) {
      await FcrConfirmation.updateOne(
        { brandName: client.brandName, recipeName: dishName, phase: phaseKey, code: code || null, confirmed: true },
        { $set: { confirmed: false } }
      );
    }

    return res.json({
      success: true,
      refId: name,
      uom: cleanUom,
      unitPrice: price,
      yieldPercent: yld,
      netPrice,
      recipesUpdated: modified,
      note: modified === 0 ? "No matching ingredient found for this brand yet." : undefined,
    });
  } catch (err) {
    console.error("[POC] postFcrItem error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save FCR price" });
  }
}

// POC confirms (or un-confirms) one specific iteration's FCR, making it
// visible to the client. Upserts so confirming a never-seen iteration works.
export async function patchFcrConfirm(req, res) {
  try {
    const client = await loadClient(req, res, "brandName");
    if (!client) return;

    const { recipeName, phase, code, confirmed } = req.body || {};
    const phaseKey = String(phase || "").toUpperCase();
    if (!["TRIAL", "TRAINING", "FINAL"].includes(phaseKey)) {
      return res.status(400).json({ message: "phase must be TRIAL, TRAINING, or FINAL" });
    }
    const dishName = String(recipeName || "").trim();
    if (!dishName) return res.status(400).json({ message: "recipeName is required" });

    const isConfirmed = confirmed === false ? false : true;
    const codeVal = phaseKey === "FINAL" ? null : code || null;

    const doc = await FcrConfirmation.findOneAndUpdate(
      { brandName: client.brandName, recipeName: dishName, phase: phaseKey, code: codeVal },
      {
        $set: {
          confirmed: isConfirmed,
          confirmedBy: isConfirmed ? req.user?._id || req.user?.adminId || null : null,
          confirmedAt: isConfirmed ? new Date() : null,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      success: true,
      recipeName: doc.recipeName,
      phase: doc.phase,
      code: doc.code,
      confirmed: doc.confirmed,
      confirmedAt: doc.confirmedAt,
    });
  } catch (err) {
    console.error("[POC] patchFcrConfirm error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update confirmation" });
  }
}

// Per-dish iteration timeline (T1→T2→T3→TR1→TR2→TR3→Final), each tagged with
// its confirmation status. The POC sees ALL iterations regardless of
// confirmation — the UI distinguishes confirmed vs pending visually.
export async function getFcrSummary(req, res) {
  try {
    const client = await loadClient(req, res, "brandName");
    if (!client) return;
    const result = await svcGetFcrSummary(client.brandName);
    return res.json({ success: true, brandWide: true, ...result });
  } catch (err) {
    console.error("[POC] getFcrSummary error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR summary" });
  }
}

/* ============================================================
 * 4c. Producer-dashboard data (FUTURE sources) — read-only aggregator.
 * Returns POC-entered / explicit-empty shapes today; swaps to live producer
 * dashboards later without changing the response contract.
 * ========================================================== */

export async function getProducerData(req, res) {
  try {
    const client = await loadClient(req, res, "brandName");
    if (!client) return;
    const [production, warehouse, localKitchen] = await Promise.all([
      getProductionStatus(client.brandName),
      getWarehouseStock(client.brandName),
      getLocalKitchenStock(client.brandName),
    ]);
    return res.json({ success: true, production, warehouse, localKitchen });
  } catch (err) {
    console.error("[POC] getProducerData error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load producer data" });
  }
}

/* ============================================================
 * 5. SOP — document links only (read-only on the client side later).
 * ========================================================== */

export async function getSop(req, res) {
  try {
    const client = await loadClient(req, res, "sopDocuments");
    if (!client) return;
    return res.json({ success: true, documents: client.sopDocuments || [] });
  } catch (err) {
    console.error("[POC] getSop error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load SOP documents" });
  }
}

// Replace the SOP list with the validated set the POC submits (structured:
// each entry is title + link, not free text).
export async function postSop(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { documents } = req.body || {};
    if (!Array.isArray(documents)) {
      return res.status(400).json({ message: "documents[] is required" });
    }

    const cleaned = documents
      .map((d) => ({
        title: String(d?.title || "").trim(),
        link: String(d?.link || "").trim(),
        updatedAt: new Date(),
      }))
      .filter((d) => d.title && d.link);

    if (documents.length > 0 && cleaned.length === 0) {
      return res.status(400).json({ message: "Each SOP document needs a title and a link" });
    }

    await User.findByIdAndUpdate(client._id, { $set: { sopDocuments: cleaned } });
    return res.json({ success: true, documents: cleaned });
  } catch (err) {
    console.error("[POC] postSop error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save SOP documents" });
  }
}

/* ============================================================
 * 6. Branch assignment — replaces the temp default seeded in Dashboard #1.
 * ========================================================== */

export async function patchBranches(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { assignedBranches } = req.body || {};
    if (!Array.isArray(assignedBranches) || assignedBranches.length === 0) {
      return res.status(400).json({ message: "assignedBranches must be a non-empty array" });
    }
    const cleaned = [...new Set(assignedBranches.map((b) => String(b).trim().toUpperCase()))];
    const invalid = cleaned.filter((b) => !KNOWN_BRANCHES.includes(b));
    if (invalid.length) {
      return res.status(400).json({
        message: `Unknown branch code(s): ${invalid.join(", ")}. Allowed: ${KNOWN_BRANCHES.join(", ")}`,
      });
    }

    await User.findByIdAndUpdate(client._id, { $set: { assignedBranches: cleaned } });
    return res.json({
      success: true,
      assignedBranches: cleaned.map((code) => ({
        branchCode: code,
        displayName: BRANCH_DISPLAY[code] || code,
      })),
    });
  } catch (err) {
    console.error("[POC] patchBranches error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update branches" });
  }
}

/* ============================================================
 * 7. Invoicing — TRIGGER ONLY. Appends an UNPAID record. NO money math, NO GST.
 * (Migrated from the TEMP admin endpoint.)
 * ========================================================== */

// Upload an invoice attachment (PDF/DOC/DOCX) to Cloudinary. The POC calls this
// BEFORE raising the invoice, then passes the returned URL into the raise body.
export async function postInvoiceAttachment(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const { attachmentUrl, attachmentName } = await uploadInvoiceBuffer(
      req.file.buffer,
      req.file.originalname || "attachment"
    );
    return res.status(201).json({ success: true, attachmentUrl, attachmentName });
  } catch (err) {
    console.error("[POC] postInvoiceAttachment error:", err?.message || err);
    return res.status(500).json({ message: err?.message || "Failed to upload attachment" });
  }
}

export async function postInvoice(req, res) {
  try {
    // Need email + name so we can notify the client; assignedBranches for the
    // branch check; brandName for the email body.
    const client = await loadClient(req, res, "assignedBranches email name");
    if (!client) return;

    const { type, amount, branchCode, commission, notes, attachmentUrl, attachmentName, supplementaryReason } =
      req.body || {};
    const allowed = ["ONBOARDING", "PROCUREMENT", "SUBSCRIPTION", "REIMBURSEMENT"];
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: `type must be one of ${allowed.join(", ")}` });
    }
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ message: "amount must be greater than 0" });

    const comm = Number(commission || 0);
    if (!(comm >= 0)) return res.status(400).json({ message: "commission cannot be negative" });

    let branch = "";
    if (branchCode) {
      branch = String(branchCode).trim().toUpperCase();
      if (!(client.assignedBranches || []).includes(branch)) {
        return res.status(403).json({ message: "Branch not assigned to this client" });
      }
    }

    // Reject arbitrary attachment URLs — only Cloudinary-hosted ones are stored.
    if (attachmentUrl && !isValidCloudinaryUrl(attachmentUrl)) {
      return res.status(400).json({ message: "Invalid attachment URL" });
    }

    // Create a Razorpay order for the full payable total at raise time.
    let order;
    try {
      order = await createInvoiceOrder(amt + comm, `${type.slice(0, 4)}`);
    } catch (e) {
      console.error("[POC] Razorpay order failed:", e?.message || e);
      return res.status(502).json({ message: "Could not create payment order" });
    }

    const invoice = {
      type,
      amount: amt,
      commission: comm,
      notes: String(notes || ""),
      branchCode: branch,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      supplementaryReason: String(supplementaryReason || ""),
      razorpayOrderId: order.id,
      status: "UNPAID",
      paidVia: null,
      createdAt: new Date(),
    };
    const updated = await User.findByIdAndUpdate(
      client._id,
      { $push: { invoices: invoice } },
      { new: true }
    ).select("invoices");

    const created = updated.invoices[updated.invoices.length - 1];

    // Fire-and-forget client notification — never blocks the response.
    if (client.email) {
      sendEmail({
        to: client.email,
        subject: `New ${type} invoice — Skope Kitchens`,
        html: invoiceRaisedEmailHtml({
          brandName: client.brandName,
          type,
          amount: amt,
          commission: comm,
          notes,
          branchCode: branch,
          attachmentUrl: attachmentUrl || "",
          attachmentName: attachmentName || "",
          supplementaryReason,
        }),
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      invoice: created,
      razorpayOrderId: order.id,
    });
  } catch (err) {
    console.error("[POC] postInvoice error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create invoice" });
  }
}

export async function getInvoices(req, res) {
  try {
    const client = await loadClient(req, res, "invoices");
    if (!client) return;
    const data = (client.invoices || [])
      .map((inv) => ({
        id: String(inv._id),
        type: inv.type,
        amount: Number(inv.amount || 0),
        commission: Number(inv.commission || 0),
        total: Number(inv.amount || 0) + Number(inv.commission || 0),
        status: inv.status,
        branchCode: inv.branchCode || "",
        notes: inv.notes || "",
        attachmentUrl: inv.attachmentUrl || null,
        attachmentName: inv.attachmentName || null,
        paidVia: inv.paidVia || null,
        paidAt: inv.paidAt || null,
        parentInvoiceId: inv.parentInvoiceId ? String(inv.parentInvoiceId) : null,
        supplementaryReason: inv.supplementaryReason || "",
        createdAt: inv.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[POC] getInvoices error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load invoices" });
  }
}

/* ============================================================
 * 8. Procurement mode + ingredient list (gates WHEN a price is entered)
 * ========================================================== */

export async function patchProcurementMode(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const phaseKey = String(req.body?.phase || "").toUpperCase();
    const phase = PHASES[phaseKey];
    if (!phase) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });

    const mode = String(req.body?.mode || "");
    if (!["SKOPE_PROCURES", "CLIENT_PROCURES"].includes(mode)) {
      return res.status(400).json({ message: "mode must be SKOPE_PROCURES or CLIENT_PROCURES" });
    }

    await User.findByIdAndUpdate(client._id, {
      $set: { [`procurement.${phase.key}.mode`]: mode },
    });
    return res.json({ success: true, phase: phaseKey, mode });
  } catch (err) {
    console.error("[POC] patchProcurementMode error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update procurement mode" });
  }
}

// Generate the phase's ingredient list READ-ONLY from the brand's trial/training
// recipe BOMs (reusing the shared BOM expander), snapshot it, and mark "sent".
// If the brand has no trial/training recipes yet (Head Chef dashboard not built),
// the list is empty and we do NOT mark it sent — no fabricated data.
export async function postProcurementList(req, res) {
  try {
    const client = await loadClient(req, res, "brandName procurement");
    if (!client) return;

    const phaseKey = String(req.body?.phase || "").toUpperCase();
    const phase = PHASES[phaseKey];
    if (!phase) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });

    const recipes = await phase.Model.find({ brand: brandExact(client.brandName) })
      .select("items")
      .lean();

    const all = [];
    for (const r of recipes) {
      const leaves = await extractIngredientsFromBOM(r.items, 1, client.brandName, new Set());
      all.push(...leaves);
    }

    // Carry forward any previously-entered prices for items that still match
    // by name — regenerating the list (e.g. recipe changed) must not silently
    // wipe prices the POC already entered.
    const prevItems = client.procurement?.[phase.key]?.ingredientList || [];
    const prevPriceByName = new Map(
      prevItems
        .filter((it) => it.unitPrice != null)
        .map((it) => [String(it.itemName || "").trim().toLowerCase(), it.unitPrice])
    );

    const aggregated = Array.from(aggregateIngredients(all).values()).map((d) => {
      const qty = Number(d.qty.toFixed(4));
      const prevPrice = prevPriceByName.get(d.itemName.trim().toLowerCase());
      return {
        itemName: d.itemName,
        uom: d.uom,
        qty,
        unitPrice: prevPrice != null ? prevPrice : null,
        totalPrice: prevPrice != null ? round2(qty * prevPrice) : null,
      };
    });

    if (aggregated.length === 0) {
      return res.json({
        success: true,
        sent: false,
        phase: phaseKey,
        items: [],
        message: `No ${phase.label.toLowerCase()} recipes for this brand yet — nothing to send.`,
      });
    }

    const allPriced = aggregated.every((it) => it.unitPrice != null);
    const grandTotal = round2(aggregated.reduce((sum, it) => sum + Number(it.totalPrice || 0), 0));
    const pricingStatus = allPriced ? "PRICED" : "AWAITING_PRICING";

    const now = new Date();
    await User.findByIdAndUpdate(client._id, {
      $set: {
        [`procurement.${phase.key}.ingredientList`]: aggregated,
        [`procurement.${phase.key}.listSentAt`]: now,
        [`procurement.${phase.key}.grandTotal`]: grandTotal,
        [`procurement.${phase.key}.pricingStatus`]: pricingStatus,
      },
    });

    return res.json({ success: true, sent: true, phase: phaseKey, listSentAt: now, items: aggregated, grandTotal, pricingStatus });
  } catch (err) {
    console.error("[POC] postProcurementList error:", err?.message || err);
    return res.status(500).json({ message: "Failed to generate ingredient list" });
  }
}

export async function getProcurementList(req, res) {
  try {
    const client = await loadClient(req, res, "procurement");
    if (!client) return;

    const phaseKey = String(req.query?.phase || "").toUpperCase();
    const phase = PHASES[phaseKey];
    if (!phase) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });

    const p = client.procurement?.[phase.key] || {};
    return res.json({
      success: true,
      phase: phaseKey,
      mode: p.mode || "SKOPE_PROCURES",
      listSentAt: p.listSentAt || null,
      items: p.ingredientList || [],
      grandTotal: p.grandTotal ?? null,
      pricingStatus: p.pricingStatus || "AWAITING_PRICING",
    });
  } catch (err) {
    console.error("[POC] getProcurementList error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load ingredient list" });
  }
}

// Procurement (vendor) prices on the brand-wide ingredient list — separate
// from FCR/recipe pricing (postFcrItem) and from the per-kitchen-list pricing
// on ingredient_lists_to_poc. Same itemName-match-and-lock pattern as both.
export async function patchProcurementListPrices(req, res) {
  try {
    const client = await loadClient(req, res, "_id procurement");
    if (!client) return;

    const phaseKey = String(req.body?.phase || "").toUpperCase();
    const phase = PHASES[phaseKey];
    if (!phase) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });

    const list = client.procurement?.[phase.key]?.ingredientList || [];
    if (list.length === 0) {
      return res.status(400).json({ message: "No ingredient list has been generated for this phase yet" });
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ message: "At least one priced ingredient is required" });

    const priceByName = new Map();
    for (const entry of rawItems) {
      const itemName = String(entry?.itemName || "").trim();
      const unitPrice = Number(entry?.unitPrice);
      if (!itemName) return res.status(400).json({ message: "Every priced entry needs an itemName" });
      if (!(unitPrice > 0)) return res.status(400).json({ message: `"${itemName}" needs a unitPrice greater than 0` });
      const key = itemName.toLowerCase();
      if (!list.some((it) => String(it.itemName || "").trim().toLowerCase() === key)) {
        return res.status(400).json({ message: `Unknown ingredient: "${itemName}"` });
      }
      priceByName.set(key, unitPrice);
    }

    const updated = list.map((it) => {
      const key = String(it.itemName || "").trim().toLowerCase();
      if (!priceByName.has(key)) return it;
      const unitPrice = priceByName.get(key);
      return { ...it, unitPrice, totalPrice: round2(Number(it.qty || 0) * unitPrice) };
    });

    const allPriced = updated.length > 0 && updated.every((it) => it.unitPrice != null);
    const grandTotal = round2(updated.reduce((sum, it) => sum + Number(it.totalPrice || 0), 0));
    const pricingStatus = allPriced ? "PRICED" : "AWAITING_PRICING";

    await User.findByIdAndUpdate(client._id, {
      $set: {
        [`procurement.${phase.key}.ingredientList`]: updated,
        [`procurement.${phase.key}.grandTotal`]: grandTotal,
        [`procurement.${phase.key}.pricingStatus`]: pricingStatus,
      },
    });

    return res.json({ success: true, phase: phaseKey, items: updated, grandTotal, pricingStatus });
  } catch (err) {
    console.error("[POC] patchProcurementListPrices error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save prices" });
  }
}

/* ============================================================
 * 8b. Ingredient lists from the Head Chef (#4) — ADDITIVE.
 * The Head Chef sends a trial/training iteration's ingredient list here so the
 * POC can action it through the existing procurement workflow (mode + list).
 * Read + acknowledge only — no money, no schema change to existing collections.
 * ========================================================== */

export async function getIngredientLists(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    const q = { clientId: client._id };
    if (String(req.query?.status || "").toUpperCase() === "PENDING") q.pocAcknowledgedAt = null;
    const list = await IngredientListToPoc.find(q).sort({ sentAt: -1 }).limit(100).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[POC] getIngredientLists error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load ingredient lists" });
  }
}

export async function acknowledgeIngredientList(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    const { listId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(listId))) return res.status(400).json({ message: "Invalid list id" });

    const doc = await IngredientListToPoc.findOneAndUpdate(
      { _id: listId, clientId: client._id, pocAcknowledgedAt: null },
      { $set: { pocAcknowledgedAt: new Date(), pocAcknowledgedBy: req.user?._id || req.user?.adminId || null } },
      { new: true }
    ).lean();
    if (!doc) {
      const exists = await IngredientListToPoc.exists({ _id: listId, clientId: client._id });
      if (!exists) return res.status(404).json({ message: "Ingredient list not found" });
      return res.status(409).json({ message: "Already acknowledged" });
    }
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("[POC] acknowledgeIngredientList error:", err?.message || err);
    return res.status(500).json({ message: "Failed to acknowledge list" });
  }
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/* ============================================================
 * 8c. Procurement price entry + invoice raising on a kitchen list
 * — ADDITIVE. This is a PROCUREMENT (vendor cost) price, separate from
 * FCR/recipe pricing (postFcrItem). No connection to the FCR engine.
 * ========================================================== */

export async function patchIngredientListPrices(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    const { listId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(listId))) return res.status(400).json({ message: "Invalid list id" });

    const doc = await IngredientListToPoc.findOne({ _id: listId, clientId: client._id });
    if (!doc) return res.status(404).json({ message: "Ingredient list not found" });
    if (doc.pricingStatus === "INVOICE_RAISED") {
      return res.status(409).json({ message: "Invoice already raised for this list — prices are locked" });
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ message: "At least one priced ingredient is required" });

    for (const entry of rawItems) {
      const itemName = String(entry?.itemName || "").trim();
      const unitPrice = Number(entry?.unitPrice);
      if (!itemName) return res.status(400).json({ message: "Every priced entry needs an itemName" });
      if (!(unitPrice > 0)) return res.status(400).json({ message: `"${itemName}" needs a unitPrice greater than 0` });

      const target = doc.items.find((it) => it.itemName.trim().toLowerCase() === itemName.toLowerCase());
      if (!target) return res.status(400).json({ message: `Unknown ingredient: "${itemName}"` });

      target.unitPrice = unitPrice;
      target.totalPrice = round2(target.qty * unitPrice);
    }

    const allPriced = doc.items.length > 0 && doc.items.every((it) => it.unitPrice != null);
    doc.pricingStatus = allPriced ? "PRICED" : "AWAITING_PRICING";
    doc.grandTotal = round2(doc.items.reduce((sum, it) => sum + Number(it.totalPrice || 0), 0));

    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("[POC] patchIngredientListPrices error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save prices" });
  }
}

export async function postRaiseInvoiceFromList(req, res) {
  try {
    const client = await loadClient(req, res, "assignedBranches email name procurement");
    if (!client) return;
    const { listId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(listId))) return res.status(400).json({ message: "Invalid list id" });

    const doc = await IngredientListToPoc.findOne({ _id: listId, clientId: client._id });
    if (!doc) return res.status(404).json({ message: "Ingredient list not found" });
    if (doc.pricingStatus === "INVOICE_RAISED") {
      return res.status(409).json({ message: "Invoice already raised for this list" });
    }
    if (doc.pricingStatus !== "PRICED") {
      return res.status(400).json({ message: "All ingredients must be priced before raising an invoice" });
    }
    if (!(doc.grandTotal > 0)) {
      return res.status(400).json({ message: "Grand total must be greater than 0" });
    }

    const phase = PHASES[doc.phase];
    const mode = client.procurement?.[phase?.key]?.mode || "SKOPE_PROCURES";
    if (mode !== "SKOPE_PROCURES") {
      return res.status(400).json({ message: "Client is self-procuring for this phase; no invoice needed." });
    }

    let order;
    try {
      order = await createInvoiceOrder(doc.grandTotal, "PROC");
    } catch (e) {
      console.error("[POC] Razorpay order failed:", e?.message || e);
      return res.status(502).json({ message: "Could not create payment order" });
    }

    const invoice = {
      type: "PROCUREMENT",
      amount: doc.grandTotal,
      commission: 0,
      notes: `Procurement for ${doc.recipeName || "dish"} ${doc.phase} ${doc.code}`,
      branchCode: "",
      attachmentUrl: null,
      attachmentName: null,
      supplementaryReason: "",
      razorpayOrderId: order.id,
      status: "UNPAID",
      paidVia: null,
      createdAt: new Date(),
    };
    const updated = await User.findByIdAndUpdate(
      client._id,
      { $push: { invoices: invoice } },
      { new: true }
    ).select("invoices");
    const created = updated.invoices[updated.invoices.length - 1];

    doc.invoiceId = created._id;
    doc.pricingStatus = "INVOICE_RAISED";
    await doc.save();

    if (client.email) {
      sendEmail({
        to: client.email,
        subject: `New PROCUREMENT invoice — Skope Kitchens`,
        html: invoiceRaisedEmailHtml({
          brandName: client.brandName,
          type: "PROCUREMENT",
          amount: doc.grandTotal,
          commission: 0,
          notes: invoice.notes,
          branchCode: "",
          attachmentUrl: "",
          attachmentName: "",
          supplementaryReason: "",
        }),
      }).catch(() => {});
    }

    return res.status(201).json({ success: true, invoice: created, razorpayOrderId: order.id, list: doc });
  } catch (err) {
    console.error("[POC] postRaiseInvoiceFromList error:", err?.message || err);
    return res.status(500).json({ message: "Failed to raise invoice" });
  }
}

/* ============================================================
 * 9. Menu & Projections — VIEW-ONLY (the client owns these inputs)
 * ========================================================== */

export async function getMenu(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    const list = await MenuEntry.find({ clientId: client._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: stripDeletedMenuItems(list) });
  } catch (err) {
    console.error("[POC] getMenu error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load menu" });
  }
}

export async function getProjections(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;
    // Existing Projection model, by-brand query. No schema change.
    const list = await Projection.find({ brandId: client._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[POC] getProjections error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load projections" });
  }
}

/* ============================================================
 * 10. Client settings — clientType flag + go-live
 * ========================================================== */

export async function patchClientType(req, res) {
  try {
    const client = await loadClient(req, res, "_id");
    if (!client) return;

    const { clientType } = req.body || {};
    if (!["B2C", "B2B"].includes(clientType)) {
      return res.status(400).json({ message: "clientType must be B2C or B2B" });
    }
    await User.findByIdAndUpdate(client._id, { $set: { clientType } });
    return res.json({ success: true, clientType });
  } catch (err) {
    console.error("[POC] patchClientType error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update client type" });
  }
}

export async function patchGoLive(req, res) {
  try {
    const client = await loadClient(req, res, "lifecycleStage");
    if (!client) return;

    // TODO: gate on subscription paid once finance ownership is decided.
    // (Payment ownership is FROZEN — do not build payment enforcement here.)
    await User.findByIdAndUpdate(client._id, { $set: { lifecycleStage: "LIVE" } });
    return res.json({ success: true, lifecycleStage: "LIVE" });
  } catch (err) {
    console.error("[POC] patchGoLive error:", err?.message || err);
    return res.status(500).json({ message: "Failed to set go-live" });
  }
}
