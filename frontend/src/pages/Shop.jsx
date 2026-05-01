import React, { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import { Link } from "react-router-dom";
import axios from "axios";
import categoryImages from "../utils/categoryImage.js";

const Shop = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");

  // 🔹 Loading states
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const API = import.meta.env.VITE_API_BASE_URL;

  // Ref for Products section
  const productsRef = useRef(null);

  // -----------------------------
  // Fetch products
  // -----------------------------
  useEffect(() => {
    setLoadingProducts(true);
    setLoadingCategories(true);

    axios
      .get(`${API}/api/products`)
      .then((res) => {
        setProducts(res.data);
      })
      .catch(console.error)
      .finally(() => {
        setLoadingProducts(false);
        setLoadingCategories(false);
      });
  }, []);

  // -----------------------------
  // Filter products by search
  // -----------------------------
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const name = product.itemName || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });
  }, [products, search]);

  // -----------------------------
  // Categories derived from filtered products
  // -----------------------------
  const filteredCategories = useMemo(() => {
    const categorySet = new Set();

    filteredProducts.forEach((product) => {
      if (product.category) {
        categorySet.add(product.category);
      }
    });

    return Array.from(categorySet);
  }, [filteredProducts]);

  // -----------------------------
  // Handle ENTER key → scroll
  // -----------------------------
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      productsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  // -----------------------------
  // Skeleton Components
  // -----------------------------
  const CategorySkeleton = () => (
    <div className="h-80 rounded-lg bg-gray-200 animate-pulse" />
  );

  const ProductSkeleton = () => (
    <div className="text-center animate-pulse">
      <div className="bg-gray-200 h-56 rounded-lg mb-4" />
      <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2" />
      <div className="h-10 bg-gray-200 rounded w-full" />
    </div>
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">

        {/* ---------------- Hero Section ---------------- */}
        <section className="bg-cover bg-center bg-[url('/assets/Main-bg.png')] px-8 py-12 mx-8 mt-8 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-4">KitchenPure</h1>
              <p className="text-gray-700 max-w-md">
                High-quality supplies delivered with precision and care.
                Built to help kitchens operate faster, smarter, and more
                efficiently.
              </p>
            </div>
            <Link to="/eligibility-form">
              <button className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800">
                Become a Partner
              </button>
            </Link>
          </div>
        </section>

        {/* ---------------- Search Bar ---------------- */}
        <section className="px-8 pt-16 pb-6 flex justify-center">
          <input
            type="text"
            placeholder="Search products or categories (e.g. Apple, Dairy, Oil)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full max-w-2xl px-5 py-3 rounded-full border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </section>

        {/* ---------------- Categories Section ---------------- */}
        <section className="px-8 py-10">
          <h2 className="text-3xl font-bold text-center mb-12">
            Categories We Offer
          </h2>

          {loadingCategories ? (
            <div className="grid grid-cols-5 grid-rows-2 gap-8">
              {Array.from({ length: 10 }).map((_, i) => (
                <CategorySkeleton key={i} />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <p className="text-center text-gray-500">
              No categories found.
            </p>
          ) : (
            <div className="grid grid-cols-5 grid-rows-2 gap-8">
              {filteredCategories.map((category, index) => {
                const image =
                  categoryImages[category] ||
                  "/assets/categories/default.jpg";

                return (
                  <Link key={index} to={`/category/${category}`}>
                    <div className="h-80 rounded-lg overflow-hidden relative cursor-pointer hover:shadow-xl transition">
                      <img
                        src={image}
                        alt={category}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-end p-4">
                        <span className="text-white text-lg font-semibold">
                          {category}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- Customer Reviews ---------------- */}
        <section className="px-8 py-16 bg-white flex flex-col items-center">
          <h2 className="text-3xl font-bold text-center mb-12">
            Customer Reviews
          </h2>

          <div className="grid grid-cols-3 w-9/12 gap-8">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="bg-gray-200 h-64 rounded-lg flex items-end pb-4 pl-4"
              >
                <span className="font-semibold text-gray-800">
                  Customer Review
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Products Section ---------------- */}
        <section ref={productsRef} className="px-8 py-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            Available Raw Materials
          </h2>

          {loadingProducts ? (
            <div className="grid grid-cols-5 gap-8">
              {Array.from({ length: 10 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-gray-500">
              No products found.
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-8">
              {filteredProducts.map((product, index) => (
                <div key={product._id || index} className="text-center">
                  <div className="bg-gray-200 h-56 rounded-lg mb-4 overflow-hidden">
                    <img
                      src={product.image_url || "/assets/placeholder.jpg"}
                      alt={product.itemName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <p className="font-semibold mb-2">
                    {product.itemName}
                  </p>

                  <Link
                    to={`/product/${encodeURIComponent(product.itemName)}`}
                  >
                    <button className="bg-black text-white w-full py-2 rounded hover:bg-gray-800 transition">
                      Add to cart →
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </Layout>
  );
};

export default Shop;
