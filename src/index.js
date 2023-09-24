const { default: axios } = require('axios');
const { BanchoClient, ChannelMessage } = require('bancho.js');
const { Api } = require('node-osu');
const config = require('../config.json');

const log = (...args) => console.log.apply(null, [new Date(), ...args]);

const client = new BanchoClient({
	username: config.auth.username,
	password: config.auth.password
});
const api = new Api(config.apiKey.osu);


config.channel.forEach(ch => {
	if (ch === "PM") return;
	const channel = client.getChannel(ch);
	channel.on('message', (msg) => {
		sendDiscord(msg, ch);
	});
});

if (config.enable_pm) {
	client.on('PM', (msg) => {
		sendDiscord(msg, 'PM');
	});
}

client.connect().then(() => {
	log("[BANCHO] Connected to bancho!");
	config.channel.forEach(ch => {
		if (ch === "PM") return;
		client.getChannel(ch).join().then(log(`[BANCHO] Joined ${ch}`));
	});
});

process.on('unhandledRejection', (reason) => {
	log(`Unhandled Rejection: \n ${reason}`);
});

//sometimes api.getUser() is fail, so this will retrying
async function getUser(nama) {
	let retries = 3;
	let delay = 500;

	while (retries > 0) {
		try {
			let userapi = await api.getUser({ u: nama });
			return userapi;
		} catch (error) {
			log(`Failed to get user: ${error}`);
			retries--;
			log("Failed to get, retrying");
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	log('Exceeded maximum retries, Unable to get user');
	return null;
}
function convertlength(panjang) {
	let minutes = Math.floor(panjang / 60) || 0;
	let seconds = panjang - minutes * 60;
	let time = minutes + ":" + seconds;
	return time;
}
async function sendDiscord(msg, ch) {
	let content, embed;
	let diffs = [];
	let nama = msg.user.ircUsername;
	let userapi = await getUser(nama);
	let webhook = config.webhook[ch];

	if (msg.content.includes('ACTION')) {
		content = msg.getAction(msg.content);
		if (msg.content.includes('playing') || msg.content.includes('listening') || msg.content.includes('beatmapsets/')) {
			const regex = /beatmapsets\/(\d+)/;
			let id = content.match(regex)[1];

			let beatmap = await api.getBeatmaps({ s: id });
			let creator = await getUser(beatmap[0].creator);

			let rankeddate = new Date(beatmap[0].raw_approvedDate).toLocaleDateString('en-US', {
				year: "numeric",
				month: "long",
				day: "numeric",
			});

			beatmap.sort((a, b) => parseFloat(a.difficulty.rating) - parseFloat(b.difficulty.rating));
			for (let b of beatmap) {
				let diff = {
					name: `**__${b.version}__**`,
					value: `**⟩ Diff:** ${parseFloat(b.difficulty.rating).toFixed(2)} ⭐ **⟩ Max Combo:** x${b.maxCombo} \n**⟩ AR:** ${b.difficulty.approach} **⟩ OD:** ${b.difficulty.overall} **⟩ HP:** ${b.difficulty.drain} **⟩ CS:** ${b.difficulty.size}`
				};

				diffs.push(diff);
			}

			embed = {
				"id": 404114358,
				"author": {
					"name": `${beatmap[0].artist} - ${beatmap[0].title} by ${creator.name ? creator.name : "Unknown"}`,
					"icon_url": `https://a.ppy.sh/${creator.id}`
				},
				"description": `**Length:** ${convertlength(beatmap[0].length.total)} **BPM:** ${beatmap[0].bpm} `,
				"thumbnail": {
					"url": `https://b.ppy.sh/thumb/${id}l.jpg`
				},
				"fields": diffs,
				"color": 65280,
				"footer": {
					"text": `${beatmap[0].approvalStatus} | ${beatmap[0].counts.favourites}❤︎ | Approved ${rankeddate}`
				}
			};
		}
		content = `*${nama} ${content}*`;
	} else {
		content = msg.content;
	}
	axios(webhook, {
		method: "POST",
		data: {
			"username": `${nama} (${ch})`,
			"avatar_url": "https://a.ppy.sh/" + userapi.id,
			"content": content,
			"tts": false,
			"allowed_mentions": {
				"parse": []
			},
			"embeds": embed ? [embed] : []
		}
	}).catch(error => {
		if (error.response) {
			log(error.response.data);
		}
	});
}