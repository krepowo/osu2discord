const { BanchoClient } = require("bancho.js");
const { Api } = require("node-osu");

const { loadConfig } = require("./config");
const { createTtlCache } = require("./cache");
const { buildMapEmbed, buildMapCard, stripMapLinks, parseMapLink, truncate, LIMITS } = require("./format");
const { createCacheJanitor } = require("./janitor");
const { sendWebhook, sleep } = require("./discord");

const log = (...args) => console.log(new Date().toISOString(), ...args);

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
}

const USER_TTL_MS = 24 * 60 * 60 * 1000;
const MAP_TTL_MS = 24 * 60 * 60 * 1000;

const client = new BanchoClient({
  username: config.auth.username,
  password: config.auth.password,
});
const api = new Api(config.apiKey);
const userCache = createTtlCache();
const mapCache = createTtlCache();

async function getUser(username) {
  return userCache.get(username.toLowerCase(), USER_TTL_MS, async () => {
    let lastError;
    let delay = 400;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await api.getUser({ u: username });
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await sleep(delay);
          delay *= 2;
        }
      }
    }
    log(`[api] getUser(${username}) failed: ${lastError?.message}`);
    return null;
  });
}

async function getBeatmaps(setId) {
  return mapCache.get(String(setId), MAP_TTL_MS, async () => {
    const beatmaps = await api.getBeatmaps({ s: String(setId) });
    return Array.isArray(beatmaps) && beatmaps.length > 0 ? beatmaps : null;
  });
}

async function resolveSetId(beatmapId) {
  return mapCache.get(`b:${beatmapId}`, MAP_TTL_MS, async () => {
    const beatmaps = await api.getBeatmaps({ b: String(beatmapId) });
    const setId = beatmaps?.[0]?.beatmapSetId;
    return setId ? Number(setId) : null;
  });
}

async function buildEmbedForSet(setId) {
  const beatmaps = await getBeatmaps(setId);
  if (!beatmaps) {
    log(`[map] beatmapset ${setId} not found`);
    return null;
  }
  const creatorName = beatmaps[0]?.creator;
  const creatorUser = creatorName ? await getUser(creatorName) : null;
  return buildMapEmbed(beatmaps, creatorUser);
}

async function buildCardForSet(setId, comment = "") {
  const beatmaps = await getBeatmaps(setId);
  if (!beatmaps) {
    log(`[map] beatmapset ${setId} not found`);
    return null;
  }
  return buildMapCard(beatmaps, { comment });
}

async function handleMessage(msg, channelName) {
  const webhookUrl = config.webhook[channelName];
  if (!webhookUrl) return;

  const username = msg?.user?.ircUsername;
  if (!username) return;

  const action = msg.getAction();
  const text = action !== undefined ? action : String(msg.content ?? "");
  const link = parseMapLink(text);
  const setId = link ? (link.setId ?? (await resolveSetId(link.beatmapId))) : null;
  const user = await getUser(username);

  const senderName = truncate(`${username} (${channelName})`, 80);
  const avatar = user?.id ? { avatar_url: `https://a.ppy.sh/${user.id}` } : {};

  if (config.cardStyle === "v2" && setId) {
    const comment = action === undefined ? stripMapLinks(text) : "";
    const card = await buildCardForSet(setId, comment);
    if (card) {
      await sendWebhook(webhookUrl, { ...card, username: senderName, ...avatar }, { log });
      return;
    }
  }

  const embed = setId ? await buildEmbedForSet(setId) : null;
  const content = action !== undefined ? `*${username} ${action}*` : text;

  await sendWebhook(
    webhookUrl,
    {
      username: senderName,
      tts: false,
      allowed_mentions: { parse: [] },
      ...(user?.id ? { avatar_url: `https://a.ppy.sh/${user.id}` } : {}),
      ...(content ? { content: truncate(content, LIMITS.content) } : {}),
      ...(embed ? { embeds: [embed] } : {}),
    },
    { log }
  );
}

function bridge(source, channelName) {
  source.on("message", (msg) => {
    handleMessage(msg, channelName).catch((err) =>
      log(`[bridge] ${channelName}: ${err.stack || err}`)
    );
  });
}

for (const channelName of config.channels) {
  bridge(client.getChannel(channelName), channelName);
}
if (config.enablePm) {
  client.on("PM", (msg) => {
    handleMessage(msg, "PM").catch((err) => log(`[bridge] PM: ${err.stack || err}`));
  });
}

const janitor = createCacheJanitor(client, { cap: config.cacheCap, log });

async function joinChannels() {
  for (const channelName of config.channels) {
    try {
      await client.getChannel(channelName).join();
      log(`[bancho] joined ${channelName}`);
    } catch (err) {
      log(`[bancho] failed to join ${channelName}: ${err.message}`);
    }
  }
}

client.on("connected", () => {
  log(`[bancho] connected as ${config.auth.username}`);
  joinChannels();
});
client.on("disconnected", (err) => {
  log(`[bancho] disconnected${err ? `: ${err.message || err}` : ""}`);
});
client.on("error", (err) => {
  log(`[bancho] error: ${err?.message || err}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[app] ${signal} received, closing connection`);
  janitor.stop();
  try {
    client.disconnect();
  } catch (err) {
    log(`[app] disconnect error: ${err.message}`);
  }
  setTimeout(() => process.exit(0), 250).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  log(`[unhandledRejection] ${reason?.stack || reason}`);
});

(async () => {
  await client.connect();
  janitor.start();
  log(`[cache] janitor active (cap ${janitor.cap} users, checked every 10 minutes)`);
})().catch((err) => {
  log(`[fatal] ${err.stack || err}`);
  process.exit(1);
});
