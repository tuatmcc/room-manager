import type { Context } from "hono";

import type { AppEnv, Env } from "@/env";
import type { AppLogger } from "@/logger";
import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import { TouchCardHandler } from "./touch-card";
import { TouchCardPresenter } from "./touch-card-presenter";

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
  logger: AppLogger,
): LocalDeviceHandlers {
  const touchCardPresenter = new TouchCardPresenter(services.discord, env);

  return {
    touchCard: new TouchCardHandler(
      usecases.touchCard,
      touchCardPresenter,
      services.discord,
      logger.child({ tag: "touch-card" }),
    ),
  };
}
