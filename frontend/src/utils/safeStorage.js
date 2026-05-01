export function storageAvailable() {
  try {
    const testKey = "__test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function safeGet(key) {
  if (!storageAvailable()) return null;

  try {
    return (
      sessionStorage.getItem(key) ||
      localStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

export function safeGetJSON(key) {
  const value = safeGet(key);
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
