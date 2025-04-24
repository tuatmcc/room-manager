import type {
	APIChatInputApplicationCommandInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import {
	ApplicationCommandOptionType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { convertMessageToEmbed } from "@/discord";
import type { UseCases } from "@/usecase";

import { RegisterNfcCardHandler } from "./register-nfc-card";
import { RegisterStudentCardHandler } from "./register-student-card";

export interface SlashCommandHandlers {
	registerStudentCard: RegisterStudentCardHandler;
	registerNfcCard: RegisterNfcCardHandler;
}

export function createSlashCommandHandlers(
	usecases: UseCases,
): SlashCommandHandlers {
	return {
		registerStudentCard: new RegisterStudentCardHandler(
			usecases.registerStudentCard,
		),
		registerNfcCard: new RegisterNfcCardHandler(usecases.registerNfcCard),
	};
}

export const SlashCommandSchema = z.union([
	z.object({
		name: z.literal("room"),
		options: z
			.union([
				z.object({
					type: z.literal(ApplicationCommandOptionType.SubcommandGroup),
					name: z.literal("register"),
					options: z
						.union([
							z.object({
								type: z.literal(ApplicationCommandOptionType.Subcommand),
								name: z.literal("student-card"),
								options: z
									.object({
										type: z.literal(ApplicationCommandOptionType.Integer),
										name: z.literal("student-id"),
										value: z.number(),
									})
									.array(),
							}),
							z.object({
								type: z.literal(ApplicationCommandOptionType.Subcommand),
								name: z.literal("nfc"),
								options: z
									.object({
										type: z.literal(ApplicationCommandOptionType.String),
										name: z.literal("idm"),
										value: z.string(),
									})
									.array(),
							}),
						])
						.array(),
				}),
				z.object({
					type: z.literal(ApplicationCommandOptionType.Subcommand),
					name: z.literal("list"),
				}),
			])
			.array(),
	}),
	z.object({
		name: z.literal("room-admin"),
		options: z
			.object({
				type: z.literal(ApplicationCommandOptionType.SubcommandGroup),
				name: z.literal("setting"),
				options: z
					.object({
						type: z.literal(ApplicationCommandOptionType.Subcommand),
						name: z.literal("register"),
						options: z
							.object({
								type: z.literal(ApplicationCommandOptionType.Boolean),
								name: z.literal("allow"),
								value: z.boolean(),
							})
							.array(),
					})
					.array(),
			})
			.array(),
	}),
]);

// eslint-disable-next-line complexity
export async function handleSlashCommand(
	handlers: SlashCommandHandlers,
	interaction: APIChatInputApplicationCommandInteraction,
): Promise<APIInteractionResponse> {
	const notImplemented: APIInteractionResponse = {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			embeds: [
				convertMessageToEmbed({
					title: "エラー",
					description: "このコマンドは未実装です。",
					color: "red",
				}),
			],
			flags: MessageFlags.Ephemeral,
		},
	};
	const invalidRequestError = new HTTPException(400, {
		message: "Invalid request",
	});

	const slashCommand = SlashCommandSchema.safeParse(interaction.data);
	if (!slashCommand.success) {
		throw invalidRequestError;
	}

	switch (slashCommand.data.name) {
		case "room": {
			const option1 = slashCommand.data.options[0];
			switch (option1?.name) {
				case "register": {
					const option2 = option1.options[0];
					switch (option2?.name) {
						case "student-card": {
							const discordId = interaction.member?.user.id;
							const studentId = option2.options[0]?.value;
							if (discordId === undefined || studentId === undefined) {
								throw invalidRequestError;
							}

							return await handlers.registerStudentCard.handle(
								discordId,
								studentId,
							);
						}
						case "nfc": {
							const discordId = interaction.member?.user.id;
							const idm = option2.options[0]?.value;
							if (discordId === undefined || idm === undefined) {
								throw invalidRequestError;
							}

							return await handlers.registerNfcCard.handle(discordId, idm);
						}
					}
					throw invalidRequestError;
				}
				case "list":
					return notImplemented;
				default:
					throw invalidRequestError;
			}
		}
		case "room-admin":
			return notImplemented;
		default:
			slashCommand.data satisfies never;
			throw invalidRequestError;
	}
}
