import React, { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useCart } from "../context/CartContext";

export default function Product() {
  const { addToCart } = useCart();
  const { itemName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const API = import.meta.env.VITE_API_BASE_URL;

  const [offers, setOffers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  /* 🔐 Check login */
  const isLoggedIn = () => {
    return (
      sessionStorage.getItem("skope_auth_token") ||
      localStorage.getItem("skope_auth_token")
    );
  };

  // 1️⃣ Fetch products
  useEffect(() => {
    axios.get(`${API}/api/products`)
      .then(res => {
        setAllProducts(res.data);

        const routeName = decodeURIComponent(itemName)
          .trim()
          .toLowerCase();

        const matched = res.data.filter(p => {
          const dbName = String(p.itemName || "")
            .trim()
            .toLowerCase();

          return dbName === routeName;
        });

        setOffers(matched);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [itemName]);

  // 2️⃣ Unique vendor offers
  const uniqueOffers = useMemo(() => {
    const seen = new Set();
    return offers.filter(o => {
      const supplier = o.supplierName;
      if (!supplier) return true;
      if (seen.has(supplier)) return false;
      seen.add(supplier);
      return true;
    });
  }, [offers]);

  const category = offers[0]?.category;
  const productName = offers[0]?.itemName;

  // 3️⃣ Recommended products
  const recommendedProducts = useMemo(() => {
    if (!category) return [];

    const seen = new Set();

    return allProducts.filter(p => {
      const name = p.itemName;

      if (
        p.category === category &&
        name !== productName &&
        !seen.has(name)
      ) {
        seen.add(name);
        return true;
      }
      return false;
    }).slice(0, 4);
  }, [allProducts, category, productName]);

  // 4️⃣ Loading states
  if (loading) {
    return (
      <Layout>
        <p className="text-center py-20">Loading product…</p>
      </Layout>
    );
  }

  if (offers.length === 0) {
    return (
      <Layout>
        <p className="text-center py-20">Product not found</p>
      </Layout>
    );
  }

  // 5️⃣ Add to cart with auth check
  const handleAddToCart = (offer) => {
    if (!isLoggedIn()) {
      // save current page
      sessionStorage.setItem("redirectAfterLogin", location.pathname);
      navigate("/login");
      return;
    }

    addToCart({
      id: offer.itemName + offer.supplierName,
      name: offer.itemName,
      price: offer.unitCost,
      supplier: offer.supplierName,
      unit: offer.unit,
    });

    alert("Product added to cart");
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-10">

        <h1 className="text-4xl font-bold mb-2">{productName}</h1>

        <p className="text-gray-500 mb-10">
          Category: {category}
        </p>

        {/* Vendor offers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          {uniqueOffers.map(offer => (
            <div
              key={offer.itemName + offer.supplierName}
              className="border rounded-xl p-6 shadow-sm flex justify-between"
            >
              <div className="w-5/12 flex justify-center">
                <img
                  src={offer.image_url}
                  alt={offer.itemName}
                  className="h-40 object-contain"
                />
              </div>

              <div className="w-7/12">
                <h3 className="font-semibold text-lg">{offer.supplierName}</h3>
                <h3 className="text-lg">{offer.itemName}</h3>

                <p className="text-sm text-gray-500 mb-2">
                  Unit: {offer.unit}
                </p>

                <p className="text-2xl font-bold mb-2">
                  ₹{offer.unitCost}
                </p>

                <p className="text-sm text-gray-600 mb-1">
                  Available Qty: {offer.totalQty}
                </p>

                <button
                  onClick={() => handleAddToCart(offer)}
                  className="mt-3 w-full bg-black text-white py-2 rounded-full"
                >
                  Add to cart →
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Recommended */}
        {recommendedProducts.length > 0 && (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Recommended Products
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {recommendedProducts.map(p => (
                <Link
                  key={p.itemName}
                  to={`/product/${encodeURIComponent(p.itemName)}`}
                  className="border rounded-xl p-4 text-center"
                >
                  <div className="h-40 bg-gray-100 mb-3">
                    <img
                      src={p.image_url}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <p className="font-semibold">{p.itemName}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        <Link to={`/category/${category}`} className="text-blue-600 mt-6 block">
          ← Back to category
        </Link>
      </div>
    </Layout>
  );
}
