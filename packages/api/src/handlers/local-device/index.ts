import type { Context } from "hono";

import type { Env } from "@/env";
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
): LocalDeviceHandlers {
	return {
		touchCard: new TouchCardHandler(usecases.touchCard),
	};
}
