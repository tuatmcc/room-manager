import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

export class PingHandler {
	handle(): APIInteractionResponse {
		return {
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "pong",
				flags: MessageFlags.Ephemeral,
			},
		};
	}
}
