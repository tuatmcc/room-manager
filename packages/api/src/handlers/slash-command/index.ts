import type {
	APIChatInputApplicationCommandInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";

import type { UseCases } from "@/usecase";

import { RegisterStudentCardHandler } from "./register-student-card";

export interface SlashCommandHandler {
	handle(
		interaction: APIChatInputApplicationCommandInteraction,
	): Promise<APIInteractionResponse>;
}

interface SlashCommandHandlers {
	registerStudentCard: RegisterStudentCardHandler;
}

export function createSlashCommandHandlers(
	usecases: UseCases,
): SlashCommandHandlers {
	return {
		registerStudentCard: new RegisterStudentCardHandler(
			usecases.registerStudentCard,
		),
	};
}

export async function handleSlashCommand(
	handlers: SlashCommandHandlers,
	interaction: APIChatInputApplicationCommandInteraction,
): Promise<APIInteractionResponse> {
	switch (interaction.data.name) {
		case "room-manager": {
			const subcommandGroup = interaction.data.options?.find(
				(o) => o.type === ApplicationCommandOptionType.SubcommandGroup,
			);

			if (subcommandGroup === undefined) {
				throw new HTTPException(400, { message: "Invalid request" });
			}

			switch (subcommandGroup.name) {
				case "register": {
					const subcommand = subcommandGroup.options.at(0);

					if (subcommand === undefined) {
						throw new HTTPException(400, { message: "Invalid request" });
					}

					switch (subcommand.name) {
						case "student-card":
							return await handlers.registerStudentCard.handle(interaction);
					}
				}
			}
		}
	}

	throw new HTTPException(400, { message: "Invalid request" });
}
