import { useState } from "react";

const PHASE_LABEL = (it) => {
  if (it.phase === "FINAL") return "Final Recipe";
  return it.code || it.phase;
};

const fmt = (n) => Number(n || 0).toFixed(2);

// Renders one ingredient or sub-recipe row. Sub-recipe rows are expandable —
// clicking them reveals their own constituent ingredients (recursively, in
// case a sub-recipe nests another sub-recipe), same columns as a direct
// ingredient, indented one level — mirroring how expandItem() traverses BOMs.
function ItemRow({ row, depth }) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `${depth * 16}px` };

  if (row.type === "SUBRECIPE") {
    return (
      <>
        <tr className="border-t border-gray-100 bg-gray-50">
          <td className="py-1 pr-2" style={indent}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 font-medium text-blue-700 hover:underline"
            >
              <span>{open ? "▾" : "▸"}</span>
              {row.itemName}
              <span className="text-xs text-gray-400 font-normal">(sub-recipe)</span>
            </button>
          </td>
          <td className="py-1 pr-2 text-gray-400">—</td>
          <td className="py-1 pr-2">{row.uom}</td>
          <td className="py-1 pr-2">{row.quantity}</td>
          <td className="py-1 pr-2 text-gray-400">—</td>
          <td className="py-1 pr-2">{row.yieldPercent}%</td>
          <td className="py-1 pr-2 font-medium">₹{fmt(row.totalCost)}</td>
        </tr>
        {open &&
          (row.ingredients || []).map((child, i) => (
            <ItemRow key={i} row={child} depth={depth + 1} />
          ))}
      </>
    );
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="py-1 pr-2 text-gray-900" style={indent}>{row.itemName}</td>
      <td className="py-1 pr-2 text-gray-500">{row.specification || "—"}</td>
      <td className="py-1 pr-2">{row.uom}</td>
      <td className="py-1 pr-2">{row.quantity}</td>
      <td className="py-1 pr-2">₹{fmt(row.unitPrice)}</td>
      <td className="py-1 pr-2">{row.yieldPercent}%</td>
      <td className="py-1 pr-2">₹{fmt(row.netPrice)}</td>
    </tr>
  );
}

/**
 * Shared tile-grid -> iteration-timeline -> ingredient-breakdown UI, used by
 * both the Client FCR page (read-only) and the POC FCR page (which also gets
 * a Confirm/Un-confirm action per iteration via onToggleConfirm).
 *
 * dishes: [{ recipeName, iterations: [{ phase, code, totalCost,
 *   suggestedSellingPrice, items, confirmed?, confirmedAt? }] }]
 *
 * No real "FCR %" exists — there is no stored selling price anywhere in the
 * system, only a 32%-target-derived suggestedSellingPrice. So trend arrows
 * compare totalCost (lower cost = improvement) rather than a true FCR ratio.
 */
export default function FcrIterationTimeline({ dishes, showConfirmation = false, onToggleConfirm }) {
  const [openDish, setOpenDish] = useState(null);
  const [openIteration, setOpenIteration] = useState(null);

  if (!dishes || dishes.length === 0) {
    return <p className="text-gray-400 text-sm">No dishes yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {dishes.map((dish) => {
          const isOpen = openDish === dish.recipeName;
          const latest = dish.iterations[dish.iterations.length - 1];
          return (
            <button
              key={dish.recipeName}
              onClick={() => {
                setOpenDish(isOpen ? null : dish.recipeName);
                setOpenIteration(null);
              }}
              className={`text-left p-4 rounded-xl border shadow-sm transition-colors ${
                isOpen ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <p className="font-semibold text-gray-900">{dish.recipeName}</p>
              {dish.iterations.length === 0 ? (
                <p className="text-xs text-amber-600 mt-1">Awaiting confirmation</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Latest cost ({PHASE_LABEL(latest)}): <span className="font-medium text-gray-700">₹{fmt(latest.totalCost)}</span>
                </p>
              )}
            </button>
          );
        })}
      </div>

      {openDish &&
        (() => {
          const dish = dishes.find((d) => d.recipeName === openDish);
          if (!dish) return null;
          return (
            <div className="border rounded-xl p-4 bg-white">
              <p className="font-semibold text-gray-900 mb-3">{dish.recipeName} — Iteration Timeline</p>
              {dish.iterations.length === 0 ? (
                <p className="text-sm text-amber-600">Awaiting confirmation — no iterations visible yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-3">
                  {dish.iterations.map((it, idx) => {
                    const prev = idx > 0 ? dish.iterations[idx - 1] : null;
                    let trend = null;
                    if (prev) {
                      if (it.totalCost < prev.totalCost) trend = "down";
                      else if (it.totalCost > prev.totalCost) trend = "up";
                      else trend = "flat";
                    }
                    const stepKey = `${it.phase}-${it.code || "FINAL"}`;
                    const isSelected = openIteration === stepKey;
                    return (
                      <button
                        key={stepKey}
                        onClick={() => setOpenIteration(isSelected ? null : stepKey)}
                        className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                          isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span className="font-medium">{PHASE_LABEL(it)}</span>
                        <span className="text-gray-600">₹{fmt(it.totalCost)}</span>
                        {trend === "down" && <span className="text-green-600">↓</span>}
                        {trend === "up" && <span className="text-red-600">↑</span>}
                        {trend === "flat" && <span className="text-gray-400">→</span>}
                        {showConfirmation && (
                          <span
                            className={`ml-1 text-xs px-1.5 py-0.5 rounded ${
                              it.confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {it.confirmed ? "✓ Confirmed" : "Pending"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {openIteration &&
                (() => {
                  const it = dish.iterations.find((x) => `${x.phase}-${x.code || "FINAL"}` === openIteration);
                  if (!it) return null;
                  return (
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">{PHASE_LABEL(it)}</span> — Total Cost ₹{fmt(it.totalCost)}, Suggested Price ₹
                          {fmt(it.suggestedSellingPrice)}
                        </p>
                        {showConfirmation && onToggleConfirm && (
                          <button
                            onClick={() => onToggleConfirm(dish, it)}
                            className={`text-xs px-3 py-1.5 rounded-lg ${
                              it.confirmed
                                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {it.confirmed ? "Un-confirm" : "Confirm"}
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-gray-500 text-left">
                            <tr>
                              <th className="py-1 pr-2">Ingredient</th>
                              <th className="py-1 pr-2">Spec</th>
                              <th className="py-1 pr-2">UOM</th>
                              <th className="py-1 pr-2">Qty</th>
                              <th className="py-1 pr-2">Unit Price</th>
                              <th className="py-1 pr-2">Yield %</th>
                              <th className="py-1 pr-2">Net Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(it.items || []).map((row, i) => (
                              <ItemRow key={i} row={row} depth={0} />
                            ))}
                            {(it.items || []).length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-3 text-center text-gray-400">
                                  No ingredients on this iteration.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
            </div>
          );
        })()}
    </div>
  );
}
