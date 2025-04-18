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
import { createLocalDeviceHandlers } from "./handlers/local-device";
import {
	createSlashCommandHandlers,
	handleSlashCommand,
} from "./handlers/slash-command";
import { createRepositories } from "./repositories";
import { createServices } from "./services";
import { createUseCases } from "./usecase";

const app = new Hono<Env>()
	.use(logger())
	.use(async (c, next) => {
		const db = drizzle(c.env.DB, { schema });
		const repositories = createRepositories(db);
		const services = createServices(
			c.env.DISCORD_BOT_TOKEN,
			c.env.DISCORD_APPLICATION_ID,
			c.env.DISCORD_GUILD_ID,
			c.env.DISCORD_CHANNEL_ID,
		);
		const usecases = createUseCases(repositories, services);

		c.set("usecases", usecases);

		await next();
	})
	.get("/", (c) => {
		return c.text("OK");
	})
	.post("/local-device/touch-student-card", async (c) => {
		const usecases = c.get("usecases");
		const localDeviceHandlers = createLocalDeviceHandlers(usecases);

		const res = await localDeviceHandlers.touchStudentCard.handle(c);
		return res;
	})
	.post("/interaction", interactionVerifier, async (c) => {
		const usecases = c.get("usecases");
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
