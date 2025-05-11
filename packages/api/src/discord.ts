import type {
	APIApplicationCommandInteractionDataOption,
	APIChatInputApplicationCommandInteraction,
	APIChatInputApplicationCommandInteractionData,
	APIEmbed,
	InteractionType,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./env";
import type { Message } from "./message";

export const interactionVerifier = createMiddleware<AppEnv>(async (c, next) => {
	const env = c.get("env");

	const signature = c.req.header("X-Signature-Ed25519");
	const timestamp = c.req.header("X-Signature-Timestamp");
	if (!signature || !timestamp) {
		return c.text("Invalid request", 400);
	}

	const body = await c.req.text();
	const isValid = await verifyKey(
		body,
		signature,
		timestamp,
		env.DISCORD_PUBLIC_KEY,
	);

	if (!isValid) {
		return c.text("Unauthorized", 401);
	}

	await next();
});

export function convertMessageToEmbed(
	message: Message,
	type?: "error",
): APIEmbed {
	const color = colorToHex(
		message.color ?? (type === "error" ? "red" : "green"),
	);

	return {
		color,
		author: message.author ? { name: message.author } : undefined,
		title: message.title,
		description: message.description,
		thumbnail: message.iconUrl ? { url: message.iconUrl } : undefined,
	};
}

function colorToHex(color: "red" | "green"): number {
	switch (color) {
		case "red":
			return 0xcc_00_00;
		case "green":
			return 0x16_cc_00;
		default:
			color satisfies never;
			return color;
	}
}

export function parseCommand(
	interactionData: APIChatInputApplicationCommandInteractionData,
): {
	commands: string[];
	options: Record<string, string | number | boolean>;
} {
	const commands = [interactionData.name];
	let options: Record<string, string | number | boolean> = {};

	const result = parseOptionsRecursive(interactionData.options ?? []);
	commands.push(...result.commands);
	options = { ...options, ...result.options };

	return { commands, options };
}

function parseOptionsRecursive(
	apiOptions: APIApplicationCommandInteractionDataOption<InteractionType.ApplicationCommand>[],
): {
	commands: string[];
	options: Record<string, string | number | boolean>;
} {
	const commands: string[] = [];
	let options: Record<string, string | number | boolean> = {};

	for (const apiOption of apiOptions) {
		if (
			apiOption.type === ApplicationCommandOptionType.SubcommandGroup ||
			apiOption.type === ApplicationCommandOptionType.Subcommand
		) {
			commands.push(apiOption.name);
			const subOptionsResult = parseOptionsRecursive(apiOption.options ?? []);
			commands.push(...subOptionsResult.commands);
			options = { ...options, ...subOptionsResult.options };
		} else {
			options[apiOption.name] = apiOption.value;
		}
	}

	return { commands, options };
}
