import { useEffect, useState } from "react";
import api from "../utils/api";

const BrandList = ({ onSelectBrand, canManage = true }) => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  useEffect(() => {
    let isMounted = true;

    const fetchBrands = async () => {
      try {
        const res = await api.get("/api/admin/brands");
        if (isMounted) {
          setBrands(res.data || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch brands", err);
        setLoading(false);
      }
    };

    // initial fetch
    fetchBrands();

    // 🔁 poll every 8 seconds for new orders
    const interval = setInterval(fetchBrands, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) return <p>Loading brands...</p>;

  return (
    <div className="bg-white rounded-xl shadow divide-y">
      {brands.map((brand) => (
        <div
          key={brand._id}
          onClick={() => {
            if (!canManage || !onSelectBrand) return;
            onSelectBrand(brand);

            // 🔕 clear dot locally once admin opens brand
            setBrands((prev) =>
              prev.map((b) =>
                b._id === brand._id
                  ? { ...b, hasNewOrder: false }
                  : b
              )
            );
          }}
          className={`p-4 flex justify-between items-center ${
            canManage ? "cursor-pointer hover:bg-gray-50" : ""
          }`}
        >
          {/* LEFT: NAME + DOT + WALLET */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {brand.brandName}
              </span>

              {/* 🔴 NEW ORDER DOT */}
              {brand.hasNewOrder && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
              )}

              {/* 🔵 NEW MENU DOT */}
              {!brand.hasNewOrder && brand.hasNewMenu && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200" />
              )}
            </div>

            <p className="text-sm text-gray-500">
              Wallet: ₹{formatMoney(brand.wallet?.balance)}
            </p>
          </div>

          {/* RIGHT */}
          {canManage && (
            <span className="text-sm text-blue-600">
              Manage →
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default BrandList;
