import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import api from "../utils/api";

const MEETING_COST = 60;

function storageAvailable() {
  try {
    const testKey = "__test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function safeGet(key) {
  if (!storageAvailable()) return null;
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeGetJSON(key) {
  const val = safeGet(key);
  try {
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function formatSlot(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function groupSlotsByDay(slots) {
  const byDay = {};
  slots.forEach((iso) => {
    const d = new Date(iso);
    const key = d.toDateString();
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(iso);
  });
  return byDay;
}

const ContactUs = () => {
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [bookError, setBookError] = useState("");
  const [selectedManager, setSelectedManager] = useState(null);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setBookError("");
    try {
      const res = await api.get("/api/meeting/slots");
      setSlots(res.data?.slots || []);
    } catch (err) {
      setSlots([]);
      if (err?.response?.status === 401) {
        setBookError("Please log in to see available slots.");
      } else {
        setBookError(err?.response?.data?.message || "Failed to load slots.");
      }
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bookingModalOpen) loadSlots();
  }, [bookingModalOpen, loadSlots]);

  const handleSchedule = (team) => {
    const user = safeGetJSON("skope_user");
    const token = safeGet("skope_auth_token") || safeGet("token");
    if (!user || !token) {
      alert("Please log in first to book a meeting.");
      return;
    }
    setSelectedManager(team?.manager || null);
    setBookError("");
    setBookingModalOpen(true);
  };

  const connectTeams = [
    {
      name: "Culinary Team",
      role: "Executive Chef",
      team: "Culinary Team",
      image: "/assets/chef.jpg",
      manager: "culinary",
    },
    {
      name: "Sanjuktha Babu",
      role: "Customer Success Manager",
      team: "Growth Team",
      image: "/assets/Sanjuktha-Babu_Light.png",
      manager: "sanjukta",
    },
    {
      name: null,
      role: null,
      team: "Data Analytics Team",
      image: "/assets/Data-Analytics.jpg",
      manager: "analytics",
    },
  ];

  const teamMembers = [
    { name: "Culinary Team", role: "Executive Chef", team: "Culinary Team", image: "/assets/chef.jpg" },
    { name: "Sanjuktha Babu", role: "Customer Success Manager", team: "Growth Team", image: "/assets/Sanjuktha-Babu.png" },
    { name: "Tom Mathew", role: "Co-founder & COO", team: "Management Team", image: "/assets/Tom-Mathew.png" },
    { name: "Meghna Raj", role: "HR Generalist", team: "HR Department", image: "/assets/Meghna-Raj.png" },
    { name: "Lukose Jacob", role: "Data Analyst", team: "Data Analyst Team", image: "/assets/Lukose-Jacob.png" },
    { name: "Prabhavathi V", role: "Junior Purchase Manager", team: "Procurement Team", image: "/assets/Prabhavathi-V.png" },
  ];

  const byDay = groupSlotsByDay(slots);

  return (
    <Layout>
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <section className="max-w-7xl mx-auto mb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Let's Connect and Solve
            </h1>
            <p className="text-xl text-gray-900 mb-6">
              Connect with the right expert for what you need
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {connectTeams.map((team, index) => (
              <div
                key={index}
                style={{ backgroundImage: `url(${team.image})` }}
                className="bg-cover bg-no-repeat bg-center flex flex-col justify-end rounded-xl p-6 h-[55vh] shadow-md"
              >
                {team.name && (
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-white">{team.name}</h3>
                    {team.role && <p className="text-sm text-white">{team.role}</p>}
                  </div>
                )}
                <p className="text-sm font-semibold text-white mb-6">{team.team}</p>
                <button
                  onClick={() => handleSchedule(team)}
                  className="w-full inline-flex items-center justify-center bg-white text-black py-3 px-6 rounded-lg font-medium hover:bg-black hover:text-white transition-colors"
                >
                  Schedule Call
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Our Teams</h2>
            <p className="text-xl text-gray-900 mb-6">Powering the Best Restaurants in Bangalore</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {teamMembers.map((member, i) => (
              <div key={i} className="text-center">
                <p className="text-sm font-semibold text-gray-900 mb-3">{member.team}</p>
                <img src={member.image} alt={member.name} className="w-64 h-64 rounded-lg mx-auto object-cover grayscale" />
                <h3 className="text-lg font-bold text-gray-900 mt-4">{member.name}</h3>
                <p className="text-sm text-gray-600">{member.role}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Booking modal: load slots → Proceed Further → POST /authorize-booking → redirect to Google booking page */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Book a meeting (₹{MEETING_COST})</h3>
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="text-gray-500 hover:text-black text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {bookError && <p className="text-red-600 text-sm mb-3">{bookError}</p>}
              {slotsLoading ? (
                <p className="text-gray-500">Loading available slots…</p>
              ) : (
                <div className="space-y-4">
                  {Object.keys(byDay).length === 0 ? (
                    <p className="text-gray-500">No slots available in the next 7 days.</p>
                  ) : (
                    Object.entries(byDay).map(([day, daySlots]) => (
                      <div key={day}>
                        <p className="text-sm font-semibold text-gray-700 mb-2">{day}</p>
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map((iso) => (
                            <span
                              key={iso}
                              className="px-3 py-1.5 text-sm border rounded-lg bg-gray-50 text-gray-700"
                            >
                              {formatSlot(iso)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setBookingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={authLoading || !selectedManager}
                className="px-4 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50 hover:bg-gray-800"
                onClick={async () => {
                  if (!selectedManager) return;
                  const ok = window.confirm(
                    `This will deduct ₹${MEETING_COST} from your wallet. Do you want to continue?`
                  );
                  if (!ok) return;
                  setAuthLoading(true);
                  setBookError("");
                  try {
                    const res = await api.post("/api/meeting/authorize-booking", {
                      manager: selectedManager,
                    });
                    const url = res.data?.bookingUrl;
                    if (!url) {
                      throw new Error("Missing booking URL");
                    }
                    window.location.href = url;
                  } catch (err) {
                    setBookError(
                      err?.response?.data?.message || "Booking authorization failed."
                    );
                  } finally {
                    setAuthLoading(false);
                  }
                }}
              >
                {authLoading ? "Processing…" : "Proceed Further"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ContactUs;
