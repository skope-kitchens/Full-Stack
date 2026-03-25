import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { fetchClientInventory } from "../utils/api";

const ClientInventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  let clientId = null;
  try {
    const stored =
      JSON.parse(sessionStorage.getItem("skope_user")) ||
      JSON.parse(localStorage.getItem("skope_user"));
    clientId = stored?.id || null;
  } catch {
    clientId = null;
  }

  useEffect(() => {
    const load = async () => {
      if (!clientId) {
        setError("Client not found in session");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await fetchClientInventory(clientId);
        setItems(res.data?.items || []);
      } catch (err) {
        setError(
          err.response?.data?.message || "Failed to load inventory"
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  // Sorting rule:
  // 1) availableQty > 0 first
  // 2) then availableQty = 0
  // 3) within each group alphabetical by itemName
  const sortedItems = [...items].sort((a, b) => {
    const aQty = Number(a.availableQty || 0);
    const bQty = Number(b.availableQty || 0);

    const aHas = aQty > 0;
    const bHas = bQty > 0;

    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    const aName = String(a.itemName || "");
    const bName = String(b.itemName || "");
    return aName.localeCompare(bName);
  });

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <h1 className="text-2xl font-semibold">Inventory</h1>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow p-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Item Name</th>
                  <th className="p-2 text-left">Unit</th>
                  <th className="p-2 text-right">Available Quantity</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-gray-500">
                      Loading inventory...
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-gray-500">
                      No inventory items found.
                    </td>
                  </tr>
                )}
                {!loading &&
                  sortedItems.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{row.itemName}</td>
                      <td className="p-2">{row.uom}</td>
                      <td className="p-2 text-right">
                        {Number(row.availableQty || 0).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ClientInventory;

