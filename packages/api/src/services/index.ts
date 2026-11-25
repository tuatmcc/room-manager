import type { Env } from "@/env";
import type { AppLogger } from "@/logger";

import { DiscordService } from "./DiscordService";
import { DisplayMessageService } from "./DisplayMessageService";

export interface Services {
  discord: DiscordService;
  displayMessage: DisplayMessageService;
}

export function createServices(env: Env, logger: AppLogger): Services {
  return {
    discord: new DiscordService(
      env.KV,
      env.DISCORD_BOT_TOKEN,
      env.DISCORD_GUILD_ID,
      env.DISCORD_CHANNEL_ID,
      logger.child({ tag: "discord" }),
    ),
    displayMessage: new DisplayMessageService(env.KV, logger.child({ tag: "display-message" })),
  };
}
