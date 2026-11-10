function createCacheJanitor(client, { cap = 20000, intervalMs = 10 * 60 * 1000, log = () => {} } = {}) {
  const CacheMap = client.users.constructor;
  let timer = null;

  function prune() {
    const before = Number(client.users?.size);
    if (!Number.isFinite(before) || before <= cap) return 0;

    client.users = new CacheMap();
    client.usersById = new CacheMap();
    log(`[cache] pruned ${before} -> 0 (cap ${cap})`);
    return before;
  }

  function start() {
    if (timer) return timer;
    timer = setInterval(prune, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return timer;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { prune, start, stop, cap };
}

module.exports = { createCacheJanitor };
