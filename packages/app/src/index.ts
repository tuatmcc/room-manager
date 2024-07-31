import { Client } from "discord.js";
import { pino } from "pino";

import { parseEnv } from "./env";
import { handlers } from "./handlers/discord";

const env = parseEnv();

const logger = pino();

const client = new Client({
	intents: [],
});

client.on("ready", () => {
	logger.info("Discord bot is ready.");
});

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const handler = handlers.get(interaction.commandName);
	if (!handler) return;

	logger.info(`Handling command: ${interaction.commandName}`);
	await handler(interaction);
});

await client.login(env.DISCORD_BOT_TOKEN);
