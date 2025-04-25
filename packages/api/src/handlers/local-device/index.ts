import type { Context } from "hono";

import type { Env } from "@/env";
import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import { TouchCardHandler } from "./touch-card";

export interface LocalDeviceHandler {
	handle(ctx: Context<Env>): Promise<Response>;
}

export interface LocalDeviceHandlers {
	touchCard: TouchCardHandler;
}

export function createLocalDeviceHandlers(
	usecases: UseCases,
	services: Services,
): LocalDeviceHandlers {
	return {
		touchCard: new TouchCardHandler(usecases.touchCard, services.discord),
	};
}
