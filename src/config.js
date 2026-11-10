const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "config.json");

class ConfigError extends Error {}

function loadConfig(file = DEFAULT_CONFIG_PATH) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new ConfigError(`cannot read ${file}: ${err.message}`);
  }

  const errors = [];
  const filled = (value) => typeof value === "string" && value.trim().length > 0;

  if (!filled(raw.auth?.username)) errors.push("auth.username is empty");
  if (!filled(raw.auth?.password)) {
    errors.push("auth.password is empty (IRC password from osu.ppy.sh/home/account/edit#legacy-api)");
  }
  if (!filled(raw.apiKey?.osu)) {
    errors.push("apiKey.osu is empty (legacy API key from account/edit#legacy-api)");
  }
  if (!Array.isArray(raw.channel) || raw.channel.length === 0) {
    errors.push('channel must be a non-empty array, e.g. ["#osu", "PM"]');
  }

  const enablePm = raw.enable_pm === true;
  const channels = [];
  const listed = Array.isArray(raw.channel) ? raw.channel : [];

  for (const channel of listed) {
    if (typeof channel !== "string" || channel.trim() === "") {
      errors.push(`invalid channel entry: ${JSON.stringify(channel)}`);
      continue;
    }

    const isPm = channel.toUpperCase() === "PM";
    if (isPm && !enablePm) continue;
    if (!isPm) channels.push(channel);

    const webhook = raw.webhook?.[channel];
    if (!filled(webhook)) {
      errors.push(`webhook["${channel}"] is empty`);
      continue;
    }
    try {
      const url = new URL(webhook);
      if (!/^https?:$/.test(url.protocol)) throw new Error("protocol must be http or https");
    } catch (err) {
      errors.push(`webhook["${channel}"] is not a valid URL (${err.message})`);
    }
  }

  if (enablePm && !listed.some((channel) => String(channel).toUpperCase() === "PM")) {
    errors.push('enable_pm is true but "PM" is not listed in channel[]');
  }

  if (errors.length > 0) {
    throw new ConfigError(`invalid config:\n  - ${errors.join("\n  - ")}`);
  }

  return {
    auth: { username: raw.auth.username, password: raw.auth.password },
    apiKey: raw.apiKey.osu,
    webhook: raw.webhook,
    channels,
    enablePm,
    cardStyle: raw.card_style === "embed" ? "embed" : "v2",
    cacheCap: Number.isFinite(raw.cache_cap) ? raw.cache_cap : 20000,
  };
}

module.exports = { loadConfig, ConfigError, DEFAULT_CONFIG_PATH };
