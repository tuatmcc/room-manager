import type {
	APIChatInputApplicationCommandInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import {
	ApplicationCommandOptionType,
	InteractionResponseType,
} from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";

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

		const result = await this.usecase.execute(
			discordId,
			studentId.toString(10),
		);

		return result.match<APIInteractionResponse>(
			() => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					embeds: [
						{
							color: 0x00_ff_00,
							title: "学生証登録",
							description: "学生証の登録に成功しました。",
						},
					],
				},
			}),
			(error) => ({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					embeds: [
						{
							color: 0xff_00_00,
							title: "エラー",
							description:
								error.userMessage ?? "何かエラーが発生したようです。",
						},
					],
				},
			}),
		);
	}
}
