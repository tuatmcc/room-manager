import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { ListUsersUseCase } from "@/usecase/ListUsers";

export class ListUsersHandler {
	constructor(private readonly usecase: ListUsersUseCase) {}

	async handle(): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute();

		return result.match<APIInteractionResponse>(
			(message) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					embeds: [convertMessageToEmbed(message)],
					flags: MessageFlags.Ephemeral,
				},
			}),
			(error) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					embeds: [convertMessageToEmbed(error.userMessage, "error")],
					flags: MessageFlags.Ephemeral,
				},
			}),
		);
	}
}
