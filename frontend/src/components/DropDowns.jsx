import { useEffect, useState } from "react";
import api from "../utils/api.js";


/* ================= INGREDIENT DROPDOWN ================= */

export function IngredientDropdown({ value, onChange, inventory }) {
  const list = Array.isArray(inventory) ? inventory : [];

  const sortedList = [...list].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)} // ✅ item name
      className="w-full border rounded px-2 py-1"
    >
      <option value="">Select Ingredient</option>

      {sortedList.map(item => (
        <option
          key={item.skuCode}          // key can stay sku
          value={item.name}           // ✅ STORE NAME
        >
          {item.name} ({item.measuringUnit})
        </option>
      ))}
    </select>
  );
}


/* ================= SUBRECIPE DROPDOWN ================= */

export function SubRecipeDropdown({ value, onChange, subRecipes, onAddNew }) {
  return (
    <div className="flex gap-2">
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        className="flex-1 border rounded px-2 py-1"
      >
        <option value="">Select SubRecipe</option>

        {subRecipes.map(sr => (
          <option key={sr._id} value={sr.recipeName}>
            {sr.recipeName}
          </option>
        ))}
      </select>

    </div>
  );
}




