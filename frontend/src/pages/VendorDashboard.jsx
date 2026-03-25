import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

export default function VendorDashboard() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);

  let vendor = null;
  try {
    vendor =
      JSON.parse(localStorage.getItem("skope_user")) ||
      JSON.parse(sessionStorage.getItem("skope_user"));
  } catch {}

  const vendorName =
    vendor?.supplierName ||
    vendor?.storeName ||
    vendor?.name ||
    "Vendor";

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate("/");
  };

  const productupload = () => {
    navigate("/product-upload");
  };

  // 🔹 Fetch products for logged-in vendor
  useEffect(() => {
    if (!vendorName || vendorName === "Vendor") return;

    const fetchProducts = async () => {
      try {
        const res = await fetch(
          `http://localhost:5002/api/products?supplierName=${encodeURIComponent(
            vendorName
          )}`
        );

        const data = await res.json();
        setProducts(data || []);
      } catch (err) {
        console.error("Product fetch failed", err);
      }
    };

    fetchProducts();
  }, [vendorName]);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-6 py-10">

        {/* ---------- HEADER ---------- */}
        <div className="mx-auto max-w-full flex justify-center">

          <header className="rounded-2xl bg-[url('/assets/Main-bg.png')] w-10/12 bg-cover p-8 shadow ring-1">

            <div className="flex justify-between items-center">

              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Vendor Dashboard
                </p>

                <h1 className="mt-1 text-3xl font-semibold">
                  {vendorName}
                </h1>
              </div>

              <div className="buttons w-4/12 flex justify-evenly">
                <button
                  onClick={productupload}
                  className="px-4 py-2 bg-black w-5/12 text-white rounded-lg"
                >
                  Add Product
                </button>

                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-black w-5/12 text-white rounded-lg"
                >
                  Logout
                </button>
              </div>
            </div>

          </header>
        </div>

        {/* ---------- PRODUCTS TILE ---------- */}
        <div className="mx-auto max-w-5xl mt-10">
          <div className="rounded-2xl bg-white shadow p-6 border">

            <h2 className="text-xl font-semibold mb-4">
              Your Products
            </h2>

            {products.length === 0 ? (
              <p className="text-slate-500">No products uploaded yet.</p>
            ) : (
              <div className="divide-y">

                {products.map((p, idx) => (
                <div key={idx} className="py-3 flex justify-between">

                    <div className="font-medium">
                    {p.itemName || "Unnamed Product"}
                    </div>

                  <div className="text-sm text-slate-600 flex w-4/12">
                    <div className="w-6/12 flex justify-start">
                      Qty: {p.totalQty} {p.unit}
                    </div>
                    <div className="w-6/12 flex justify-start">
                      Unit Cost: ₹{p.unitCost}
                    </div>
                  </div>

                </div>
                ))}

              </div>
            )}

          </div>
        </div>

      </div>
    </Layout>
  );
}
