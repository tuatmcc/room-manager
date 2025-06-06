import type { Context } from "hono";

import type { AppEnv, Env } from "@/env";
import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import { TouchCardHandler } from "./touch-card";

export interface LocalDeviceHandler {
	handle(ctx: Context<AppEnv>): Promise<Response>;
}

export interface LocalDeviceHandlers {
	touchCard: TouchCardHandler;
}

export function createLocalDeviceHandlers(
	usecases: UseCases,
	services: Services,
	env: Env,
): LocalDeviceHandlers {
	return {
		touchCard: new TouchCardHandler(usecases.touchCard, services.discord, env),
	};
}
