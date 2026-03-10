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
import type { AppLogger } from "./logger";
import { createLogger, serializeError } from "./logger";
import { createRepositories } from "./repositories";
import { createServices } from "./services";
import { createUseCases } from "./usecase";

function createAppContext(env: Env, logger: AppLogger) {
	const db = createDatabase(env.DB);
	const repositories = createRepositories(
		db,
		logger.child({ tag: "repositories" }),
	);
	const services = createServices(env, logger.child({ tag: "services" }));
	const usecases = createUseCases(
		repositories,
		logger.child({ tag: "usecases" }),
	);

	return {
		env,
		logger,
		services,
		usecases,
	};
}

function getRouteKind(path: string): string {
	if (path === "/") return "health";
	if (path.startsWith("/local-device")) return "local-device";
	if (path.startsWith("/interaction")) return "interaction";
	return "other";
}

const app = new Hono<AppEnv>()
	.use(async (c, next) => {
		const startedAt = Date.now();
		const logger = createLogger({
			tag: "api",
			context: {
				requestId: crypto.randomUUID(),
				method: c.req.method,
				path: c.req.path,
				routeKind: getRouteKind(c.req.path),
			},
		});
		logger.info("Request started");
		c.set("logger", logger);

		try {
			const env = EnvSchema.parse(c.env);
			const appContext = createAppContext(env, logger);

			c.set("env", appContext.env);
			c.set("usecases", appContext.usecases);
			c.set("services", appContext.services);

			await next();
			logger.info("Request completed", {
				durationMs: Date.now() - startedAt,
				status: c.res.status,
			});
		} catch (error) {
			logger.error("Request failed", {
				durationMs: Date.now() - startedAt,
				...serializeError(error),
			});
			throw error;
		}
	})
	.use("/local-device", async (c, next) => {
		const env = c.get("env");
		const logger = c.get("logger").child({ tag: "local-device-auth" });

		const header = c.req.header("Authorization");
		if (!header) {
			logger.warn("Authorization header was missing");
			return c.text("Unauthorized", 401);
		}

		if (header !== `Bearer ${env.API_TOKEN}`) {
			logger.warn("Authorization header was invalid");
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
		const logger = c.get("logger").child({ tag: "local-device" });
		const localDeviceHandlers = createLocalDeviceHandlers(
			usecases,
			services,
			env,
			logger,
		);

		const res = await localDeviceHandlers.touchCard.handle(c);
		return res;
	})
	.post("/interaction", interactionVerifier, async (c) => {
		const usecases = c.get("usecases");
		const services = c.get("services");
		const logger = c.get("logger").child({ tag: "interaction" });
		const slashCommandHandlers = createSlashCommandHandlers(
			usecases,
			services,
			logger.child({ tag: "handlers" }),
		);
		const rawBody = c.get("verifiedInteractionBody");
		if (!rawBody) {
			logger.warn("Verified interaction body was missing");
			return c.text("Invalid request", 400);
		}

		let interaction: APIInteraction;
		try {
			interaction = JSON.parse(rawBody) as APIInteraction;
		} catch (error) {
			logger.warn("Failed to parse interaction body", serializeError(error));
			return c.text("Invalid request", 400);
		}

		switch (interaction.type) {
			case InteractionType.Ping:
				logger.info("Received ping interaction");
				return c.json<APIInteractionResponse>({
					type: InteractionResponseType.Pong,
				});
			case InteractionType.ApplicationCommand:
				switch (interaction.data.type) {
					case ApplicationCommandType.ChatInput: {
						const res = await handleSlashCommand(
							slashCommandHandlers,
							interaction as APIChatInputApplicationCommandInteraction,
							logger,
						);
						return c.json(res);
					}
				}
		}

		logger.warn("Received unsupported interaction", {
			interactionType: interaction.type,
		});
		return c.text("Unknown interaction", 400);
	});

const scheduled: ExportedHandlerScheduledHandler<Env> = (
	_event,
	unknownEnv,
	ctx,
) => {
	const logger = createLogger({
		tag: "api:scheduled",
		context: {
			job: "exit-all-entry-users",
			jobRunId: crypto.randomUUID(),
			routeKind: "scheduled",
		},
	});
	logger.info("Scheduled job started");
	const env = EnvSchema.parse(unknownEnv);
	const appContext = createAppContext(env, logger);
	const handlers = createScheduledHandlers(
		appContext.usecases,
		appContext.services,
		appContext.logger.child({ tag: "handlers" }),
	);

	ctx.waitUntil(
		(async () => {
			try {
				await handlers.exitAllEntryUsers.handle();
				logger.info("Scheduled job completed");
			} catch (error) {
				logger.error("Scheduled job failed", serializeError(error));
				throw error;
			}
		})(),
	);
};

export default {
	fetch: app.fetch,
	scheduled,
} satisfies ExportedHandler<Env>;
