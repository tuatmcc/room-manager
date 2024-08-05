import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

import { commands } from "@/commands";

const token = process.env["DISCORD_BOT_TOKEN"]!;
const applicationId = process.env["DISCORD_APPLICATION_ID"]!;
const guildId = process.env["DISCORD_GUILD_ID"]!;

const rest = new REST({ version: "10" }).setToken(token);

await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
	body: commands,
});
