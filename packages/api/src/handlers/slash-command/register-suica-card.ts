import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { RegisterSuicaCardUseCase } from "@/usecase/RegisterSuicaCard";

export class RegisterSuicaCardHandler {
	constructor(private readonly usecase: RegisterSuicaCardUseCase) {}

	async handle(
		discordId: string,
		suicaIdm: string,
	): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute(discordId, suicaIdm);

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
