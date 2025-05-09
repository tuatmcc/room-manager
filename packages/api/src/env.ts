import type { KVNamespace } from "@cloudflare/workers-types";
import { z } from "zod";

import type { Services } from "./services";
import type { UseCases } from "./usecase";

export const EnvSchema = z.object({
	OTEL_EXPORTER_URL: z.string(),
	OTEL_EXPORTER_TOKEN: z.string(),
	API_TOKEN: z.string(),
	DISCORD_PUBLIC_KEY: z.string(),
	DISCORD_BOT_TOKEN: z.string(),
	DISCORD_GUILD_ID: z.string(),
	DISCORD_CHANNEL_ID: z.string(),
	DB: z.custom<D1Database>(),
	KV: z.custom<KVNamespace>(),
});

export type Env = z.infer<typeof EnvSchema>;

export interface AppEnv {
	Variables: {
		env: Env;
		usecases: UseCases;
		services: Services;
	};
}
