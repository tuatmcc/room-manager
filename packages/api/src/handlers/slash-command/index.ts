import type {
	APIChatInputApplicationCommandInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";
import { match, P } from "ts-pattern";

import { colorToHex, parseCommand } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import { ListUsersHandler } from "./list-users";
import { PingHandler } from "./ping";
import { RegisterNfcCardHandler } from "./register-nfc-card";
import { RegisterStudentCardHandler } from "./register-student-card";
export interface SlashCommandHandlers {
	ping: PingHandler;
	listUsers: ListUsersHandler;
	registerStudentCard: RegisterStudentCardHandler;
	registerNfcCard: RegisterNfcCardHandler;
}

export function createSlashCommandHandlers(
	usecases: UseCases,
	services: Services,
	logger: AppLogger,
): SlashCommandHandlers {
	return {
		ping: new PingHandler(),
		listUsers: new ListUsersHandler(
			usecases.listEntryUsers,
			services.discord,
			logger.child({ tag: "list-users" }),
		),
		registerStudentCard: new RegisterStudentCardHandler(
			usecases.registerStudentCard,
			logger.child({ tag: "register-student-card" }),
		),
		registerNfcCard: new RegisterNfcCardHandler(
			usecases.registerNfcCard,
			logger.child({ tag: "register-nfc-card" }),
		),
	};
}

const NOT_IMPLEMENTED: APIInteractionResponse = {
	type: InteractionResponseType.ChannelMessageWithSource,
	data: {
		embeds: [
			{
				title: "エラー",
				description: "このコマンドは未実装です。",
				color: colorToHex("red"),
			},
		],
		flags: MessageFlags.Ephemeral,
	},
};

function handleUnknownCommand(dataJSON: string): APIInteractionResponse {
	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			embeds: [
				{
					title: "エラー",
					description: `未知のコマンドです。不具合の可能性が高いため、開発者にお問い合わせください。\n\n該当のJSON:\n\`\`\`json\n${dataJSON}\`\`\``,
					color: colorToHex("red"),
				},
			],
			flags: MessageFlags.Ephemeral,
		},
	};
}

export async function handleSlashCommand(
	handlers: SlashCommandHandlers,
	interaction: APIChatInputApplicationCommandInteraction,
	logger: AppLogger = noopLogger,
): Promise<APIInteractionResponse> {
	const member = interaction.member;
	if (!member) {
		logger.warn("Slash command interaction did not include member");
		throw new HTTPException(400, { message: "Invalid request" });
	}

	const discordId = member.user.id;
	const result = parseCommand(interaction.data);
	logger.info("Handling slash command", {
		commands: result.commands,
		discordId,
		options: result.options,
	});

	const response = match(result)
		.with(
			{ commands: ["ping"] },
			(): APIInteractionResponse => handlers.ping.handle(),
		)
		.with(
			{
				commands: ["room", "register", "student-card"],
				options: P.select({ id: P.number }),
			},
			async ({ id }) =>
				await handlers.registerStudentCard.handle(discordId, id),
		)
		.with(
			{
				commands: ["room", "register", "nfc-card"],
				options: P.select({ code: P.string, name: P.string }),
			},
			async ({ code, name }) =>
				await handlers.registerNfcCard.handle(discordId, code, name),
		)
		.with(
			{ commands: ["room", "list"] },
			async () => await handlers.listUsers.handle(),
		)
		.with(
			{
				commands: ["room-admin", "setting", "register"],
				options: P.select({ allow: P.boolean.optional() }),
			},
			() => {
				logger.info("Received not implemented slash command", {
					commands: result.commands,
					discordId,
				});
				return NOT_IMPLEMENTED;
			},
		)
		.with(P._, () => {
			logger.warn("Received unknown slash command", {
				commands: result.commands,
				discordId,
				options: result.options,
			});
			return handleUnknownCommand(JSON.stringify(interaction.data, null, 2));
		})
		.exhaustive();

	const resolved = await response;
	logger.info("Handled slash command", {
		commands: result.commands,
		discordId,
	});
	return resolved;
}
