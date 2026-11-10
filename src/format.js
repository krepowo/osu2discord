const LIMITS = {
  authorName: 256,
  fieldName: 256,
  fieldValue: 1024,
  fieldCount: 25,
  description: 4096,
  footerText: 2048,
  content: 2000,
};

const COMPONENTS_V2_FLAG = 1 << 15;
const CARD_TEXT_BUDGET = 4000;
const CARD_ACCENT = 65280;
const CARD = { actionRow: 1, button: 2, section: 9, text: 10, thumbnail: 11, separator: 14, container: 17 };

const ELLIPSIS = "…";

function truncate(value, max) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - ELLIPSIS.length)) + ELLIPSIS;
}

function convertLength(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatApprovedDate(raw, locale = "en-US") {
  if (!raw) return "Unranked";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Unranked";
  return date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

const num = (value, digits = 2) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "?";
};

function difficultyList(beatmaps) {
  const standard = beatmaps.filter((beatmap) => beatmap.mode === "Standard");
  return (standard.length > 0 ? standard : beatmaps)
    .slice()
    .sort((a, b) => parseFloat(a.difficulty?.rating ?? 0) - parseFloat(b.difficulty?.rating ?? 0));
}

function setHeader(first, creatorName) {
  return {
    title: `${first.artist} - ${first.title} by ${creatorName}`,
    stats: [
      `**Length:** ${convertLength(first.length?.total)}`,
      `**BPM:** ${first.bpm}`,
      `**Drain:** ${convertLength(first.length?.drain)}`,
    ].join(" "),
  };
}

function setFooter(first) {
  return [
    first.approvalStatus || "Unknown",
    `${first.counts?.favourites ?? 0}❤︎`,
    formatApprovedDate(first.raw_approvedDate),
  ].join(" | ");
}

const STATUS_EMOJI = {
  Ranked: "⏫",
  Approved: "⏫",
  Qualified: "⏳",
  Loved: "💖",
  Pending: "🕓",
  WIP: "🛠",
  Graveyard: "🪦",
};

function cardFooter(first) {
  const status = first.approvalStatus || "Unknown";
  const emoji = STATUS_EMOJI[status] || "⏫";
  const date = first.raw_approvedDate
    ? new Date(first.raw_approvedDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const head = date ? `${emoji} **${status} ${date}**` : `${emoji} **${status}**`;
  return `${head}\n❤️ **${first.counts?.favourites ?? 0}**`;
}

function diffStats(beatmap) {
  const d = beatmap.difficulty || {};
  return (
    `**⟩ Diff:** ${num(d.rating)} ⭐ **⟩ Max Combo:** x${beatmap.maxCombo}\n` +
    `**⟩ AR:** ${d.approach} **⟩ OD:** ${d.overall} **⟩ HP:** ${d.drain} **⟩ CS:** ${d.size}`
  );
}

function diffField(beatmap) {
  return {
    name: truncate(`**__${beatmap.version}__**`, LIMITS.fieldName),
    value: truncate(diffStats(beatmap), LIMITS.fieldValue),
  };
}

function diffBlock(beatmap) {
  return `**__${beatmap.version}__**\n${diffStats(beatmap)}`;
}

function buildMapEmbed(beatmaps, creatorUser = null) {
  if (!Array.isArray(beatmaps) || beatmaps.length === 0) return null;

  const list = difficultyList(beatmaps);
  const first = list[0];
  const creatorName = creatorUser?.name || first.creator || "Unknown";
  const { title, stats } = setHeader(first, creatorName);

  const fields = list.slice(0, LIMITS.fieldCount).map(diffField);
  if (list.length > LIMITS.fieldCount) {
    const rest = list.slice(LIMITS.fieldCount - 1);
    fields[LIMITS.fieldCount - 1] = {
      name: truncate(`**+${rest.length} more difficulties**`, LIMITS.fieldName),
      value: truncate(rest.map((beatmap) => beatmap.version).join(", "), LIMITS.fieldValue),
    };
  }

  return {
    author: {
      name: truncate(title, LIMITS.authorName),
      ...(creatorUser?.id ? { icon_url: `https://a.ppy.sh/${creatorUser.id}` } : {}),
    },
    description: truncate(stats, LIMITS.description),
    thumbnail: { url: `https://b.ppy.sh/thumb/${first.beatmapSetId}l.jpg` },
    fields,
    color: CARD_ACCENT,
    footer: { text: truncate(setFooter(first), LIMITS.footerText) },
  };
}

function parseMapLink(text) {
  const value = String(text ?? "");
  const set = value.match(/beatmapsets\/(\d+)/i);
  if (set) return { setId: Number(set[1]) };
  const beatmap = value.match(/osu\.ppy\.sh\/b\/(\d+)/i);
  if (beatmap) return { beatmapId: Number(beatmap[1]) };
  return null;
}

function stripMapLinks(text) {
  return String(text ?? "")
    .replace(/https?:\/\/osu\.ppy\.sh\/(beatmapsets|b)\/\d+\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMapCard(beatmaps, { comment = "" } = {}) {
  if (!Array.isArray(beatmaps) || beatmaps.length === 0) return null;

  const list = difficultyList(beatmaps);
  const first = list[0];
  const footer = cardFooter(first);

  const titleBlock = `# ${truncate(`${first.artist} - ${first.title}`, 250)}`;
  const infoBlock =
    `Mapped by **${truncate(first.creator || "Unknown", 100)}**\n` +
    `**Length:** ${convertLength(first.length?.total)} **BPM:** ${first.bpm}`;

  const overflowReserve = 32;
  const trimmedComment = truncate(String(comment).trim(), 500);
  const commentText = trimmedComment ? `-# "${trimmedComment}"` : "";

  let budget =
    CARD_TEXT_BUDGET -
    titleBlock.length -
    infoBlock.length -
    footer.length -
    commentText.length -
    overflowReserve;

  const blocks = [];
  for (const beatmap of list) {
    const block = diffBlock(beatmap);
    if (budget - block.length - 2 <= 0) break;
    blocks.push(block);
    budget -= block.length + 2;
  }

  const hidden = list.length - blocks.length;
  const body = blocks.join("\n\n") + (hidden > 0 ? `\n\n-# +${hidden} more difficulties` : "");

  const commentBlock = trimmedComment ? [{ type: CARD.text, content: commentText }] : [];

  return {
    flags: COMPONENTS_V2_FLAG,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: CARD.container,
        accent_color: CARD_ACCENT,
        components: [
          {
            type: CARD.section,
            components: [
              { type: CARD.text, content: titleBlock },
              { type: CARD.text, content: infoBlock },
            ],
            accessory: {
              type: CARD.thumbnail,
              media: { url: `https://b.ppy.sh/thumb/${first.beatmapSetId}l.jpg` },
            },
          },
          ...commentBlock,
          { type: CARD.separator, divider: true, spacing: 1 },
          { type: CARD.text, content: body },
          { type: CARD.separator, divider: true, spacing: 2 },
          { type: CARD.text, content: footer },
          {
            type: CARD.actionRow,
            components: [
              {
                type: CARD.button,
                style: 5,
                label: "Beatmap",
                url: `https://osu.ppy.sh/beatmapsets/${first.beatmapSetId}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

module.exports = {
  LIMITS,
  CARD,
  COMPONENTS_V2_FLAG,
  CARD_TEXT_BUDGET,
  truncate,
  convertLength,
  formatApprovedDate,
  buildMapEmbed,
  buildMapCard,
  stripMapLinks,
  parseMapLink,
};
