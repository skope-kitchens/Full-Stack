import { SubRecipeDropdown } from "./DropDowns.jsx";
import api from "../utils/api.js";

export default function RecipeItem({ node, onChange, subRecipes }) {
  const update = (patch) => onChange({ ...node, ...patch });

  const isIngredient = node.type === "INGREDIENT";

  const calculateTotal = ({ quantity, netPrice, uom }) => {
    const qty = Number(quantity || 0);
    const price = Number(netPrice || 0);
    if (!qty || !price) return 0;

    if (uom === "GM") return (qty / 1000) * price;
    return qty * price;
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center text-xs">

      {/* TYPE */}
      <select
        value={node.type}
        onChange={(e) =>
          update({
            type: e.target.value,
            refId: null,
            netPrice: "",
          })
        }
        className="col-span-1 border rounded px-1 py-1"
      >
        <option value="INGREDIENT">Ingredient</option>
        <option value="SUBRECIPE">Sub-recipe</option>
      </select>

      {/* YIELD (enabled for both) */}
      <input
        type="number"
        placeholder="Yield"
        value={node.yield || ""}
        onChange={(e) => update({ yield: Number(e.target.value) })}
        className="col-span-1 border rounded px-1 py-1"
      />

      {/* CATEGORY */}
      <select
        value={node.category}
        disabled={node.type === "SUBRECIPE"}
        onChange={(e) => update({ category: e.target.value })}
        className="col-span-1 border rounded px-1 py-1 disabled:bg-gray-100"
      >
        <option value="Food">Food</option>
        <option value="Packaging">Packaging</option>
      </select>

      {/* ITEM */}
      <div className="col-span-2">
        {isIngredient ? (
          <input
            type="text"
            value={node.refId || ""}
            onChange={(e) => update({ refId: e.target.value })}
            placeholder="Ingredient name"
            className="w-full border rounded px-2 py-1"
          />
        ) : (
          <SubRecipeDropdown
            value={node.refId}
            subRecipes={subRecipes}
            onChange={async (recipeName) => {
              if (!recipeName) return;

              const res = await api.get(
                `/api/subrecipes/${encodeURIComponent(recipeName)}/cost`
              );

              update({
                refId: recipeName,
                category: "Food",
                netPrice: res.data.cost,
                uom: "GM",
              });
            }}
            onAddNew={() => window.open("/add-subrecipe", "_blank")}
          />
        )}
      </div>

      {/* SPECIFICATION (enabled for both) */}
      <input
        placeholder="Spec"
        value={node.specification || ""}
        onChange={(e) => update({ specification: e.target.value })}
        className="col-span-2 border rounded px-1 py-1"
      />

      {/* ITEM BRAND (ingredient only) */}
      <input
        placeholder="Brand"
        value={node.itemBrand || ""}
        disabled={!isIngredient}
        onChange={(e) => update({ itemBrand: e.target.value })}
        className="col-span-1 border rounded px-1 py-1 disabled:bg-gray-100"
      />

      {/* QTY */}
      <input
        type="number"
        value={node.quantity}
        onChange={(e) => update({ quantity: e.target.value })}
        className="col-span-1 border rounded px-1 py-1"
      />

      {/* UOM */}
      <select
        value={node.uom}
        onChange={(e) => update({ uom: e.target.value })}
        className="col-span-1 border rounded px-1 py-1"
      >
        <option value="PC">PC</option>
        <option value="GM">GM</option>
        <option value="KG">KG</option>
      </select>

      {/* NET PRICE */}
      <input
        type="number"
        value={node.netPrice}
        placeholder="Custom"
        disabled={node.type === "SUBRECIPE"}
        onChange={(e) => update({ netPrice: e.target.value })}
        className="col-span-1 border rounded px-1 py-1 disabled:bg-gray-100"
      />

      {/* TOTAL */}
      <div className="col-span-1 text-right font-semibold">
        ₹{calculateTotal(node).toFixed(2)}
      </div>
    </div>
  );
}
