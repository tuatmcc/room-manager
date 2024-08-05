import type {
	APIChatInputApplicationCommandInteraction,
	APIInteraction,
	APIInteractionResponse,
} from "discord-api-types/v10";
import {
	ApplicationCommandType,
	InteractionResponseType,
	InteractionType,
} from "discord-api-types/v10";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { logger } from "hono/logger";

import * as schema from "@/schema";

import { interactionVerifier } from "./discord";
import type { Env } from "./env";
import {
	createSlashCommandHandlers,
	handleSlashCommand,
} from "./handlers/slash-command";
import { createRepositories } from "./repositories";
import { createUseCases } from "./usecase";

const app = new Hono<Env>()
	.use(logger())
	.get("/", (c) => {
		return c.text("OK");
	})
	.post("/interaction", interactionVerifier, async (c) => {
		const db = drizzle(c.env.DB, { schema });
		const repositories = createRepositories(db);
		const usecases = createUseCases(repositories);
		const slashCommandHandlers = createSlashCommandHandlers(usecases);

		const interaction: APIInteraction = await c.req.json();

		switch (interaction.type) {
			case InteractionType.Ping:
				return c.json<APIInteractionResponse>({
					type: InteractionResponseType.Pong,
				});
			case InteractionType.ApplicationCommand:
				switch (interaction.data.type) {
					case ApplicationCommandType.ChatInput: {
						const res = await handleSlashCommand(
							slashCommandHandlers,
							interaction as APIChatInputApplicationCommandInteraction,
						);
						return c.json(res);
					}
				}
		}

		return c.text("Unknown interaction", 400);
	});

export default app;
