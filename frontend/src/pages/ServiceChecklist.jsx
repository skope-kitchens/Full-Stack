import { useEffect, useState } from "react";
import api from "../utils/api";

const fetchServices = (brandId) =>
  api.get(`/api/admin/services/${brandId}`).then((res) => res.data.services);

const ServiceChecklist = ({ brandId, editable }) => {
  const [services, setServices] = useState([]);
  const [newServiceName, setNewServiceName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    if (!brandId) return;
    fetchServices(brandId)
      .then(setServices)
      .catch(console.error);
  }, [brandId]);

  const toggleService = async (name, completed) => {
    await api.patch(`/api/admin/services/${brandId}`, {
      serviceName: name,
      completed,
    });

    setServices((prev) =>
      prev.map((s) => (s.name === name ? { ...s, completed } : s))
    );
  };

  const addService = async (e) => {
    e.preventDefault();
    const name = newServiceName.trim();
    if (!name) return;
    setAddError("");
    setAdding(true);
    try {
      const res = await api.post(`/api/admin/services/${brandId}`, {
        serviceName: name,
      });
      setServices(res.data.services || []);
      setNewServiceName("");
    } catch (err) {
      setAddError(
        err.response?.data?.message || "Failed to add service"
      );
    } finally {
      setAdding(false);
    }
  };

  const deleteService = async (name) => {
    if (!window.confirm(`Remove "${name}" from this brand's services?`)) return;
    try {
      const res = await api.delete(`/api/admin/services/${brandId}`, {
        data: { serviceName: name },
      });
      setServices(res.data.services || []);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete service");
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-4">Services Checklist</h3>

      {services.map((service) => (
        <div
          key={service.name}
          className="flex items-center gap-2 mb-2 group"
        >
          <label className="flex items-center flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!!service.completed}
              disabled={!editable}
              onChange={(e) =>
                toggleService(service.name, e.target.checked)
              }
              className="mr-2"
            />
            <span>{service.name}</span>
          </label>
          {editable && (
            <button
              type="button"
              onClick={() => deleteService(service.name)}
              className="text-red-600 hover:text-red-800 text-sm opacity-70 group-hover:opacity-100"
              title="Remove service"
            >
              Delete
            </button>
          )}
        </div>
      ))}

      {editable && (
        <form onSubmit={addService} className="mt-4 pt-4 border-t">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Add new service (for this brand only)
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="text"
              value={newServiceName}
              onChange={(e) => {
                setNewServiceName(e.target.value);
                setAddError("");
              }}
              placeholder="e.g. Custom training"
              className="border rounded px-3 py-2 flex-1 min-w-[180px]"
              disabled={adding}
            />
            <button
              type="submit"
              disabled={adding || !newServiceName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? "Adding…" : "Add service"}
            </button>
          </div>
          {addError && (
            <p className="text-sm text-red-600 mt-1">{addError}</p>
          )}
        </form>
      )}
    </div>
  );
};

export default ServiceChecklist;
