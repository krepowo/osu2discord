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

## Contact

Discord: **krepowo**

osu!: <https://osu.ppy.sh/users/23622091>

## License

MIT
