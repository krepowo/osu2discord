const axios = require("axios").default ?? require("axios");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWebhook(url, payload, { log = () => {}, maxRetries = 3, timeoutMs = 15000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await axios.post(url, payload, {
        params: { wait: true, ...(payload.flags ? { with_components: true } : {}) },
        timeout: timeoutMs,
        validateStatus: () => true,
      });
    } catch (err) {
      log(`[discord] request failed: ${err.message}`);
      return null;
    }

    if (response.status === 429) {
      if (attempt === maxRetries) {
        log(`[discord] rate limited, giving up after ${maxRetries} retries`);
        return response.status;
      }
      const retryAfter = Number(response.data?.retry_after ?? 1);
      await sleep(Math.ceil(retryAfter * 1000) + 100);
      continue;
    }

    if (response.status >= 400) {
      log(`[discord] ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`);
    }
    return response.status;
  }
  return null;
}

module.exports = { sendWebhook, sleep };
