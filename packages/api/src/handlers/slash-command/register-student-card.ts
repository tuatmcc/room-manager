import type {
	APIChatInputApplicationCommandInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import {
	ApplicationCommandOptionType,
	InteractionResponseType,
} from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";

import { convertMessageToEmbed } from "@/discord";
import type { RegisterStudentCardUseCase } from "@/usecase/RegisterStudentCard";

import type { SlashCommandHandler } from ".";

export class RegisterStudentCardHandler implements SlashCommandHandler {
	constructor(private readonly usecase: RegisterStudentCardUseCase) {}

	async handle(
		interaction: APIChatInputApplicationCommandInteraction,
	): Promise<APIInteractionResponse> {
		const discordId = interaction.member?.user.id;
		const options = interaction.data.options
			?.filter((o) => o.type === ApplicationCommandOptionType.SubcommandGroup)
			.filter((o) => o.name === "register")
			.flatMap((o) => o.options)
			.filter((o) => o.name === "student-card")
			.flatMap((o) => o.options)
			.filter((o) => o !== undefined);
		const studentId = options
			?.filter((o) => o.type === ApplicationCommandOptionType.Integer)
			.find((o) => o.name === "student-id")?.value;

		if (discordId === undefined || studentId === undefined) {
			throw new HTTPException(400, { message: "Invalid request" });
		}

		const result = await this.usecase.execute(discordId, studentId);

		return result.match<APIInteractionResponse>(
			(message) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: { embeds: [convertMessageToEmbed(message)] },
			}),
			(error) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: { embeds: [convertMessageToEmbed(error.userMessage)] },
			}),
		);
	}
}
