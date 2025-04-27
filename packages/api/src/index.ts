import { otel } from "@hono/otel";
import type { ResolveConfigFn } from "@microlabs/otel-cf-workers";
import { instrument } from "@microlabs/otel-cf-workers";
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

import * as schema from "@/schema";

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

const config: ResolveConfigFn<Env> = (env) => {
	return {
		exporter: {
			url: env.OTEL_EXPORTER_URL,
		},
		service: { name: "api" },
	};
};

const app = new Hono<AppEnv>()
	.use(otel())
	.use(async (c, next) => {
		const env = EnvSchema.parse(c.env);

		const db = drizzle(env.DB, { schema });
		const repositories = createRepositories(db);
		const services = createServices(env);
		const usecases = createUseCases(repositories, services);

		c.set("env", env);
		c.set("usecases", usecases);
		c.set("services", services);

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
		const localDeviceHandlers = createLocalDeviceHandlers(usecases, services);

		const res = await localDeviceHandlers.touchCard.handle(c);
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

const scheduled: ExportedHandlerScheduledHandler = (
	_event,
	unknownEnv,
	ctx,
) => {
	const env = EnvSchema.parse(unknownEnv);

	const db = drizzle(env.DB, { schema });
	const repositories = createRepositories(db);
	const services = createServices(env);
	const usecases = createUseCases(repositories, services);
	const handlers = createScheduledHandlers(usecases, services);

	ctx.waitUntil(handlers.exitAllEntryUsers.handle());
};

export default instrument(
	{
		fetch: app.fetch,
		scheduled,
	},
	config,
);
