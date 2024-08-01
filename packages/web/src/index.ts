import type {
	APIInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import {
	InteractionResponseType,
	InteractionType,
} from "discord-api-types/v10";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { interactionVerifier } from "./discord";
import type { Env } from "./env";

const app = new Hono<Env>()
	.use(logger())
	.get("/", (c) => {
		return c.text("OK");
	})
	.post("/interaction", interactionVerifier, async (c) => {
		const interaction: APIInteraction = await c.req.json();

		if (interaction.type === InteractionType.Ping) {
			return c.json<APIInteractionResponse>({
				type: InteractionResponseType.Pong,
			});
		}

		return c.text("Unknown interaction", 400);
	});

export default app;
