import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { RegisterNfcCardUseCase } from "@/usecase/RegisterNfcCard";

export class RegisterNfcCardHandler {
	constructor(private readonly usecase: RegisterNfcCardUseCase) {}

	async handle(
		discordId: string,
		idm: string,
	): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute(discordId, idm);

		return result.match<APIInteractionResponse>(
			(message) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: { embeds: [convertMessageToEmbed(message)] },
			}),
			(error) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: { embeds: [convertMessageToEmbed(error.userMessage, "error")] },
			}),
		);
	}
}
