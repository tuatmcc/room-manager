import { z } from "zod";

export const envSchema = z.object({
	DISCORD_BOT_TOKEN: z.string(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
	return envSchema.parse(process.env);
}
