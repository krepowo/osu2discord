# osu2discord

Bridges osu! in-game chat (Bancho IRC) to Discord channels through webhooks. Map links posted in chat
are expanded into a beatmapset embed with every difficulty, star rating, AR/OD/HP/CS and approval info.

![preview](https://i.postimg.cc/ZKtQNTJ4/image.png)

## Requirements

- Node.js 20 or newer
- An osu! account to run the bridge on
- An osu! **legacy API key**: <https://osu.ppy.sh/home/account/edit#legacy-api>
- One Discord webhook URL per bridged channel

## Setup

```bash
git clone https://github.com/krepowo/osu2discord.git
cd osu2discord
cp config.example.json config.json
npm install
```

Edit `config.json`:

| Field | Meaning |
|---|---|
| `auth.username` | osu! username the bridge connects as |
| `auth.password` | **IRC password** from `account/edit#legacy-api` — not the account password |
| `apiKey.osu` | legacy osu!api v1 key |
| `webhook["#channel"]` | Discord webhook URL for that channel |
| `channel[]` | channels to bridge; `"PM"` enables private messages |
| `enable_pm` | bridge PMs (keep the PM webhook in a private Discord channel) |
| `card_style` | `"v2"` (default): map cards use Discord Components V2; `"embed"`: classic embed |
| `cache_cap` | max cached Bancho users before the cache is dropped (default `20000`) |

Run it:

```bash
npm start        # node src/index.js
npm run dev      # node --watch src/index.js
```

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | run the bridge |
| `npm run dev` | run with file watching |

## Behaviour notes

- **Message formatting is bounded by Discord limits.** A beatmapset with more than 25 difficulties is
  rendered as 24 fields plus a summary; long names are truncated. Without that, Discord rejects the
  whole message with HTTP 400.
- **Webhook sends use `wait=true`** so `retry_after` is available; a 429 is retried instead of the
  message being dropped.
- **API results are cached** (users 24 h, beatmapsets 24 h, failures 60 s) with single-flight, so ten
  people talking about the same map cost one request.
- **The Bancho user cache is capped.** bancho.js never clears it: a plain `Map` retains ~0.39 KB per
  unique user forever, its WeakRef fallback ~0.17 KB. `src/janitor.js` drops the cache when it passes
  `cache_cap`, keeping a long-running process flat at roughly 65–70 MB.
- **Map cards follow the v2 design.** `card_style: "v2"` sends a Components V2 container: a level-1
  `artist - title` heading with a second block for mapper, length and BPM beside the cover thumbnail, a
  tight separator, one block per difficulty using the same `⟩ Diff / Max Combo / AR / OD / HP / CS`
  wording the embed used, a wider separator, then a footer with a status emoji, short approval date and
  favourite count plus a `Beatmap` link button. No sender profile. Both link shapes are understood:
  `osu.ppy.sh/beatmapsets/<setId>` and the short `osu.ppy.sh/b/<beatmapId>` that osu! posts for `/np`
  (the beatmap id is resolved to its set once, then cached). A plain message that contains a map link
  keeps its words as a dim quoted line (`-# "..."`) above the difficulty list; the URL itself is
  dropped, since the card already links it. `/np` actions add no comment. Text is capped at 4000
  characters, so very large mapsets end with a `+N more difficulties` line. `"embed"` keeps the classic
  embed.
- **Mentions are disabled** on every webhook payload, so chat text can never ping `@everyone`.

## Contact

Discord: **krepowo**

osu!: <https://osu.ppy.sh/users/23622091>

## License

MIT
