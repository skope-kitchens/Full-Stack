import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { subscribe } from "../utils/toast";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribe((event) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, ...event }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    });
    return unsub;
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-xs border ${
              t.type === "success"
                ? "bg-green-600 text-white border-green-500"
                : t.type === "error"
                ? "bg-red-600 text-white border-red-500"
                : "bg-gray-900 text-white border-gray-700"
            }`}
          >
            <span className="mt-0.5 shrink-0 text-base">
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
            </span>
            <span className="leading-snug">{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
