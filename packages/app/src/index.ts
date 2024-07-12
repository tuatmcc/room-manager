import { Client } from "discord.js";
import { pino } from "pino";

import { parseEnv } from "./env";

const env = parseEnv();

const logger = pino();

const client = new Client({
	intents: [],
});

client.on("ready", () => {
	logger.info("Discord bot is ready.");
});

await client.login(env.DISCORD_BOT_TOKEN);
