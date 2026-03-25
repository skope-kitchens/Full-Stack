import React, { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

export default function Category() {
  const { categoryName } = useParams();
  const API = import.meta.env.VITE_API_BASE_URL;

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(categoryName);

  // 1️⃣ Load all products
  useEffect(() => {
    axios
      .get(`${API}/api/products`)
      .then((res) => {
        setProducts(res.data);

        // build category list
        const uniqueCategories = [
          ...new Set(res.data.map((p) => p.category || "")),
        ].filter(Boolean);

        setCategories(uniqueCategories);
      })
      .catch(console.error);
  }, []);

  // 2️⃣ Update when route changes
  useEffect(() => {
    setSelectedCategory(categoryName);
  }, [categoryName]);

  // 3️⃣ Filter products by category
  const filteredProducts = useMemo(() => {
    const routeCategory = String(selectedCategory || "")
      .trim()
      .toLowerCase();

    return products.filter((p) => {
      const dbCategory = String(p.category || "")
        .trim()
        .toLowerCase();

      return dbCategory === routeCategory;
    });
  }, [products, selectedCategory]);

  // 4️⃣ Ensure unique products by itemName
  const uniqueFilteredProducts = useMemo(() => {
    const seen = new Set();
    return filteredProducts.filter((p) => {
      const name = p.itemName;
      if (!name) return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }, [filteredProducts]);

  return (
    <Layout>
      <main className="max-w-7xl min-h-screen mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-center mb-10">
          {selectedCategory}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          {/* Sidebar */}
          <aside className="hidden lg:block bg-white rounded-xl p-6 shadow sticky top-20 h-fit">
            <div className="space-y-2">
              <h1 className="font-bold text-2xl ml-4 pb-4">Categories</h1>

              {categories.map((cat) => (
                <Link key={cat} to={`/category/${cat}`}>
                  <button
                    className={`w-full text-left px-4 py-2 rounded-lg font-medium transition ${
                      selectedCategory === cat
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    {cat}
                  </button>
                </Link>
              ))}
            </div>
          </aside>

          {/* Products */}
          <section>
            {uniqueFilteredProducts.length === 0 ? (
              <p className="text-center py-20 text-gray-500">
                No products found
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {uniqueFilteredProducts.map((product) => (
                  <div
                    key={product.itemName}
                    className="bg-white rounded-xl p-6 text-center shadow hover:shadow-lg transition"
                  >
                    <div className="h-48 rounded-lg overflow-hidden mb-4 bg-gray-100">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.itemName}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <h3 className="font-semibold">{product.itemName}</h3>

                    <Link
                      to={`/product/${encodeURIComponent(product.itemName)}`}
                      className="block bg-black text-white w-full py-2 rounded hover:bg-gray-800 transition text-center"
                    >
                      View product →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </Layout>
  );
}
