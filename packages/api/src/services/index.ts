import { DiscordService } from "./DiscordService";

export interface Services {
	discord: DiscordService;
}

export function createServices(
	botToken: string,
	applicationId: string,
	guildId: string,
	channelId: string,
): Services {
	return {
		discord: new DiscordService(botToken, applicationId, guildId, channelId),
	};
}
