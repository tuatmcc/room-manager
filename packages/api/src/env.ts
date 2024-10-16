import type { UseCases } from "./usecase";

export interface Env {
	Bindings: {
		DISCORD_PUBLIC_KEY: string;
		DB: D1Database;
	};
	Variables: {
		usecases: UseCases;
	};
}
