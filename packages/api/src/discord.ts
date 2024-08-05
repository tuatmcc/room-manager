import { verifyKey } from "discord-interactions";
import { createMiddleware } from "hono/factory";

import type { Env } from "./env";

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
