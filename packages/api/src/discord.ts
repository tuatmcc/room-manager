import type { APIEmbed } from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import { createMiddleware } from "hono/factory";

import type { Env } from "./env";
import type { Message } from "./message";

export const interactionVerifier = createMiddleware<Env>(async (c, next) => {
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
		c.env.DISCORD_PUBLIC_KEY,
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
		title: message.title,
		description: message.description,
		thumbnail: message.iconUrl ? { url: message.iconUrl } : undefined,
	};
}

function colorToHex(color: "red" | "green"): number {
	switch (color) {
		case "red":
			return 0xff_00_00;
		case "green":
			return 0x00_ff_00;
		default:
			color satisfies never;
			return color;
	}
}
