import { useState } from "react";
import api from "../utils/api";
import toast from "../utils/toast";

const WalletPanel = ({ brandId, balance }) => {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const gstRate = 0.18;
  const enteredNet = Number(amount);
  const totalToDeduct = enteredNet > 0 ? enteredNet * (1 + gstRate) : 0;

  const deduct = async () => {
    if (!amount || !reason) {
      toast.error("Amount and reason are required");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/wallet/admin/deduct", {
        userId: brandId,
        amount: Number(amount),
        reason
      });
      toast.success("Wallet deducted successfully");
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to deduct wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 border rounded-lg p-4">
      <h3 className="font-semibold mb-2">Wallet</h3>
      <p className="mb-4">Current Balance: ₹{balance}</p>

      <input
        className="input-field mb-2"
        placeholder="Deduction amount"
        value={amount}
        onChange={e => setAmount(e.target.value)}
      />

      {enteredNet > 0 && (
        <p className="text-sm text-gray-600 mb-3">
          Total to deduct (incl 18% GST): ₹{totalToDeduct.toFixed(2)}
        </p>
      )}

      <input
        className="input-field mb-4"
        placeholder="Reason for deduction"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />

      <button
        onClick={deduct}
        disabled={loading}
        className="btn-primary bg-black"
      >
        {loading ? "Processing..." : "Deduct Wallet"}
      </button>
    </div>
  );
};

export default WalletPanel;
