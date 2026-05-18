// Lightweight event-based toast system — no external dependency required.
// Usage: import toast from '../utils/toast'; toast.success('Done'); toast.error('Failed');
// Mount <ToastContainer /> once in App.jsx for notifications to render.

const listeners = [];

function emit(event) {
  listeners.forEach((fn) => fn(event));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

const toast = {
  success: (msg) => emit({ type: "success", msg: String(msg) }),
  error: (msg) => emit({ type: "error", msg: String(msg) }),
  info: (msg) => emit({ type: "info", msg: String(msg) }),
};

export default toast;
