import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../utils/api";

// MANUAL TEST (Calendly simulation):
// 1. Start a booking via the app to create a HOLD session.
// 2. Copy the returned sessionId.
// 3. Open: http://localhost:5173/booking-success?a1=<PASTE_SESSION_ID>
// This should call /api/meeting/confirm, deduct wallet, and redirect to dashboard.

const BookingSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Calendly redirects as /booking-success?a1=<sessionId>
  const sessionIdFromA1 = searchParams.get("a1");
  const sessionIdFromLegacy = searchParams.get("sessionId");
  const sessionId = sessionIdFromA1 || sessionIdFromLegacy || null;

  const [status, setStatus] = useState("loading"); // loading | success | error | invalid
  const [errorMessage, setErrorMessage] = useState("");

  const localStorageKey = sessionId
    ? `booking_confirmed_${sessionId}`
    : null;

  const confirmBooking = useCallback(async () => {
    if (!sessionId) return;

    console.log("[BOOKING_SUCCESS] Calling confirm API", {
      href: window.location.href,
      searchParams: Object.fromEntries(searchParams.entries()),
      sessionId,
    });

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await api.post(
        "/api/meeting/confirm",
        { sessionId },
        { withCredentials: true }
      );

      console.log("[BOOKING_SUCCESS] Confirm API response", {
        data: res.data,
      });

      if (localStorageKey) {
        localStorage.setItem(localStorageKey, "true");
      }

      // We could use res.data.amountDeducted if backend changes; spec says ₹50.
      setStatus("success");
    } catch (err) {
      console.error("[BOOKING_SUCCESS] Booking confirmation failed", {
        error: err,
        response: err?.response,
      });
      setStatus("error");
      setErrorMessage(
        err?.response?.data?.message ||
          "Booking found but payment confirmation failed."
      );
    }
  }, [sessionId, localStorageKey, searchParams]);

  // Initial effect – run once for this sessionId.
  useEffect(() => {
    console.log("[BOOKING_SUCCESS] Mount / param parse", {
      href: window.location.href,
      searchParams: Object.fromEntries(searchParams.entries()),
      sessionIdFromA1,
      sessionIdFromLegacy,
      effectiveSessionId: sessionId,
    });

    if (!sessionId) {
      setStatus("invalid");
      return;
    }

    if (localStorageKey && localStorage.getItem(localStorageKey) === "true") {
      // Already confirmed in a previous visit – no API call.
      setStatus("success");
      return;
    }

    console.log("[BOOKING_SUCCESS] Auto-confirming booking", {
      sessionId,
    });

    confirmBooking();
  }, [sessionId, localStorageKey, confirmBooking, searchParams, sessionIdFromA1, sessionIdFromLegacy]);

  // Auto-redirect to dashboard after success.
  useEffect(() => {
    if (status !== "success") return;

    const timer = setTimeout(() => {
      navigate("/dashboard");
    }, 4000);

    return () => clearTimeout(timer);
  }, [status, navigate]);

  let icon = "⏳";
  let title = "Confirming your booking and securing your slot...";
  let description =
    "Please wait a moment while we confirm your payment and reserve your meeting slot.";

  if (status === "success") {
    icon = "✔";
    title = "Your meeting is confirmed 🎉";
    description = "₹60 has been deducted from your wallet.";
  } else if (status === "error") {
    icon = "❌";
    title = "Booking found but payment confirmation failed.";
    description = errorMessage;
  } else if (status === "invalid") {
    icon = "❌";
    title = "No booking session found.";
    description = "Please go back and book your meeting again.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="text-4xl mb-4">{icon}</div>
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <p className="text-gray-600 mb-6">{description}</p>

        {status === "loading" && (
          <p className="text-sm text-gray-500">
            This will only take a few seconds…
          </p>
        )}

        {status === "success" && (
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 inline-flex items-center justify-center px-6 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Go to dashboard
          </button>
        )}

        {status === "error" && sessionId && (
          <div className="mt-6 space-y-3">
            <button
              onClick={confirmBooking}
              className="inline-flex items-center justify-center px-6 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
            >
              Retry confirmation
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center justify-center px-6 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors w-full"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {status === "invalid" && (
          <button
            onClick={() => navigate("/contact-us")}
            className="mt-4 inline-flex items-center justify-center px-6 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Book a new meeting
          </button>
        )}
      </div>
    </div>
  );
};

export default BookingSuccess;

