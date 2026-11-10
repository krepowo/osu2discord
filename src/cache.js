const NEGATIVE_TTL_MS = 60 * 1000;

function createTtlCache({ now = Date.now } = {}) {
  const store = new Map();
  const inflight = new Map();

  async function get(key, ttlMs, loader) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    if (inflight.has(key)) return inflight.get(key);

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        const missing = value === null || value === undefined;
        store.set(key, { value, expiresAt: now() + (missing ? Math.min(ttlMs, NEGATIVE_TTL_MS) : ttlMs) });
        return value;
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
  }

  return {
    get,
    peek: (key) => store.get(key)?.value,
    size: () => store.size,
    clear: () => store.clear(),
  };
}

module.exports = { createTtlCache, NEGATIVE_TTL_MS };
