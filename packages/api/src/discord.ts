import type {
  APIApplicationCommandInteractionDataOption,
  APIChatInputApplicationCommandInteractionData,
  InteractionType,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./env";
import type { AppLogger } from "./logger";
import { noopLogger, serializeError } from "./logger";

export const interactionVerifier = createMiddleware<AppEnv>(async (c, next) => {
  const env = c.get("env");
  const requestLogger = (c.get("logger") as AppLogger | undefined) ?? noopLogger;
  const logger = requestLogger.child({
    tag: "interaction-verifier",
  });

  const signature = c.req.header("X-Signature-Ed25519");
  const timestamp = c.req.header("X-Signature-Timestamp");
  if (!signature || !timestamp) {
    logger.warn("Interaction signature headers were missing");
    return c.text("Invalid request", 400);
  }

  const body = await c.req.text();
  let isValid: boolean;
  try {
    isValid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  } catch (error) {
    logger.error("Interaction signature verification failed", serializeError(error));
    return c.text("Unauthorized", 401);
  }

  if (!isValid) {
    logger.warn("Interaction signature was invalid");
    return c.text("Unauthorized", 401);
  }

  logger.info("Interaction signature verified");
  c.set("verifiedInteractionBody", body);
  await next();
});

export function colorToHex(color: "red" | "green"): number {
  switch (color) {
    case "red":
      return 0xcc_00_00;
    case "green":
      return 0x16_cc_00;
    default:
      color satisfies never;
      return color;
  }
}

export function parseCommand(interactionData: APIChatInputApplicationCommandInteractionData): {
  commands: string[];
  options: Record<string, string | number | boolean>;
} {
  const commands = [interactionData.name];
  let options: Record<string, string | number | boolean> = {};

  const result = parseOptionsRecursive(interactionData.options ?? []);
  commands.push(...result.commands);
  options = { ...options, ...result.options };

  return { commands, options };
}

function parseOptionsRecursive(
  apiOptions: APIApplicationCommandInteractionDataOption<InteractionType.ApplicationCommand>[],
): {
  commands: string[];
  options: Record<string, string | number | boolean>;
} {
  const commands: string[] = [];
  let options: Record<string, string | number | boolean> = {};

  for (const apiOption of apiOptions) {
    if (
      apiOption.type === ApplicationCommandOptionType.SubcommandGroup ||
      apiOption.type === ApplicationCommandOptionType.Subcommand
    ) {
      commands.push(apiOption.name);
      const subOptionsResult = parseOptionsRecursive(apiOption.options ?? []);
      commands.push(...subOptionsResult.commands);
      options = { ...options, ...subOptionsResult.options };
    } else {
      options[apiOption.name] = apiOption.value;
    }
  }

  return { commands, options };
}
