import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { RegisterNfcCardUseCase } from "@/usecase/RegisterNfcCard";

export class RegisterNfcCardHandler {
	constructor(private readonly usecase: RegisterNfcCardUseCase) {}

	async handle(
		discordId: string,
		code: string,
		name: string,
	): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute(discordId, code, name);

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
