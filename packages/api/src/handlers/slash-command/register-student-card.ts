import type { APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";

import { convertMessageToEmbed } from "@/discord";
import type { RegisterStudentCardUseCase } from "@/usecase/RegisterStudentCard";

export class RegisterStudentCardHandler {
	constructor(private readonly usecase: RegisterStudentCardUseCase) {}

	async handle(
		discordId: string,
		studentId: number,
	): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute(discordId, studentId);

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
