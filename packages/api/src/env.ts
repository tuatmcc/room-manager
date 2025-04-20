import type { Services } from "./services";
import type { UseCases } from "./usecase";

export interface Env {
	Bindings: {
		DISCORD_PUBLIC_KEY: string;
		DISCORD_BOT_TOKEN: string;
		DISCORD_APPLICATION_ID: string;
		DISCORD_GUILD_ID: string;
		DISCORD_CHANNEL_ID: string;
		DB: D1Database;
	};
	Variables: {
		usecases: UseCases;
		services: Services;
	};
}
