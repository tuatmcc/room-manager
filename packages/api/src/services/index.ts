import type { Env } from "@/env";

import type { DiscordService } from "./DiscordService";
import { ApiDiscordService } from "./DiscordService";

export interface Services {
	discord: DiscordService;
}

export function createServices(env: Env): Services {
	return {
		discord: new ApiDiscordService(
			env.KV,
			env.DISCORD_BOT_TOKEN,
			env.DISCORD_GUILD_ID,
			env.DISCORD_CHANNEL_ID,
		),
	};
}
