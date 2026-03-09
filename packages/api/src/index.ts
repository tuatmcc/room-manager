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
import { Hono } from "hono";

import { createDatabase } from "./database";
import { interactionVerifier } from "./discord";
import type { AppEnv, Env } from "./env";
import { EnvSchema } from "./env";
import { createLocalDeviceHandlers } from "./handlers/local-device";
import { createScheduledHandlers } from "./handlers/scheduled";
import {
	createSlashCommandHandlers,
	handleSlashCommand,
} from "./handlers/slash-command";
import { createRepositories } from "./repositories";
import { createServices } from "./services";
import { createUseCases } from "./usecase";

function createAppContext(env: Env) {
	const db = createDatabase(env.DB);
	const repositories = createRepositories(db);
	const services = createServices(env);
	const usecases = createUseCases(repositories);

	return {
		env,
		services,
		usecases,
	};
}

const app = new Hono<AppEnv>()
	.use(async (c, next) => {
		const env = EnvSchema.parse(c.env);
		const appContext = createAppContext(env);

		c.set("env", appContext.env);
		c.set("usecases", appContext.usecases);
		c.set("services", appContext.services);

		await next();
	})
	.use("/local-device", async (c, next) => {
		const env = c.get("env");

		const header = c.req.header("Authorization");
		if (!header) {
			return c.text("Unauthorized", 401);
		}

		if (header !== `Bearer ${env.API_TOKEN}`) {
			return c.text("Unauthorized", 401);
		}

		await next();
	})
	.get("/", (c) => {
		return c.text("OK");
	})
	.get("/local-device", (c) => {
		return c.text("OK");
	})
	.post("/local-device/touch-card", async (c) => {
		const usecases = c.get("usecases");
		const services = c.get("services");
		const env = c.get("env");
		const localDeviceHandlers = createLocalDeviceHandlers(
			usecases,
			services,
			env,
		);

		const res = await localDeviceHandlers.touchCard.handle(c);
		return res;
	})
	.post("/interaction", interactionVerifier, async (c) => {
		const usecases = c.get("usecases");
		const services = c.get("services");
		const slashCommandHandlers = createSlashCommandHandlers(usecases, services);
		const rawBody = c.get("verifiedInteractionBody");
		if (!rawBody) {
			return c.text("Invalid request", 400);
		}

		let interaction: APIInteraction;
		try {
			interaction = JSON.parse(rawBody) as APIInteraction;
		} catch {
			return c.text("Invalid request", 400);
		}

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

const scheduled: ExportedHandlerScheduledHandler<Env> = (
	_event,
	unknownEnv,
	ctx,
) => {
	const env = EnvSchema.parse(unknownEnv);
	const appContext = createAppContext(env);
	const handlers = createScheduledHandlers(
		appContext.usecases,
		appContext.services,
	);

	ctx.waitUntil(handlers.exitAllEntryUsers.handle());
};

export default {
	fetch: app.fetch,
	scheduled,
} satisfies ExportedHandler<Env>;
