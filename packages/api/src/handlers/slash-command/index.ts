import type {
  APIApplicationCommandAutocompleteInteraction,
  APIChatInputApplicationCommandInteraction,
  APIInteractionGuildMember,
  APIInteractionDataResolvedGuildMember,
  APIMessageComponentInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import {
  InteractionResponseType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { HTTPException } from "hono/http-exception";
import { match, P } from "ts-pattern";

import { colorToHex, parseCommand } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type { Services } from "@/services";
import type { UseCases } from "@/usecase";

import {
  ForceExitAutocompleteHandler,
  ForceExitCancelHandler,
  ForceExitConfirmHandler,
  ForceExitExecuteHandler,
} from "./force-exit";
import { ListUsersHandler } from "./list-users";
import { PingHandler } from "./ping";
import { RegisterNfcCardHandler } from "./register-nfc-card";
import { RegisterStudentCardHandler } from "./register-student-card";
export interface SlashCommandHandlers {
  ping: PingHandler;
  listUsers: ListUsersHandler;
  forceExitAutocomplete: ForceExitAutocompleteHandler;
  forceExitConfirm: ForceExitConfirmHandler;
  forceExitExecute: ForceExitExecuteHandler;
  forceExitCancel: ForceExitCancelHandler;
  registerStudentCard: RegisterStudentCardHandler;
  registerNfcCard: RegisterNfcCardHandler;
}

export function createSlashCommandHandlers(
  usecases: UseCases,
  services: Services,
  logger: AppLogger,
): SlashCommandHandlers {
  return {
    ping: new PingHandler(),
    listUsers: new ListUsersHandler(
      usecases.listEntryUsers,
      services.discord,
      logger.child({ tag: "list-users" }),
    ),
    forceExitAutocomplete: new ForceExitAutocompleteHandler(
      usecases.listEntryUsers,
      services.discord,
      logger.child({ tag: "force-exit-autocomplete" }),
    ),
    forceExitConfirm: new ForceExitConfirmHandler(
      usecases.listEntryUsers,
      services.discord,
      logger.child({ tag: "force-exit-confirm" }),
    ),
    forceExitExecute: new ForceExitExecuteHandler(
      usecases.forceExitEntryUser,
      services.discord,
      logger.child({ tag: "force-exit-execute" }),
    ),
    forceExitCancel: new ForceExitCancelHandler(logger.child({ tag: "force-exit-cancel" })),
    registerStudentCard: new RegisterStudentCardHandler(
      usecases.registerStudentCard,
      logger.child({ tag: "register-student-card" }),
    ),
    registerNfcCard: new RegisterNfcCardHandler(
      usecases.registerNfcCard,
      logger.child({ tag: "register-nfc-card" }),
    ),
  };
}

const NOT_IMPLEMENTED: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [
      {
        title: "エラー",
        description: "このコマンドは未実装です。",
        color: colorToHex("red"),
      },
    ],
    flags: MessageFlags.Ephemeral,
  },
};

const FORBIDDEN: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [
      {
        title: "権限がありません",
        description: "このコマンドはAdmin権限を持つユーザーのみ実行できます。",
        color: colorToHex("red"),
      },
    ],
    flags: MessageFlags.Ephemeral,
  },
};

function handleUnknownCommand(dataJSON: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: "エラー",
          description: `未知のコマンドです。不具合の可能性が高いため、開発者にお問い合わせください。\n\n該当のJSON:\n\`\`\`json\n${dataJSON}\`\`\``,
          color: colorToHex("red"),
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

function isAdmin(
  member:
    | Pick<APIInteractionDataResolvedGuildMember, "permissions" | "roles">
    | APIInteractionGuildMember
    | undefined,
  adminRoleId: string | undefined,
): boolean {
  if (!member) {
    return false;
  }

  if (adminRoleId && member.roles.includes(adminRoleId)) {
    return true;
  }

  const permissionBits = member.permissions;
  if (!permissionBits) {
    return false;
  }

  return (BigInt(permissionBits) & BigInt(PermissionFlagsBits.Administrator)) !== 0n;
}

function parseForceExitTargetUserId(value: string | number | boolean | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const userId = Number(value);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function handleSlashCommand(
  handlers: SlashCommandHandlers,
  interaction: APIChatInputApplicationCommandInteraction,
  adminRoleId: string | undefined,
  logger: AppLogger = noopLogger,
): Promise<APIInteractionResponse> {
  const member = interaction.member;
  if (!member) {
    logger.warn("Slash command interaction did not include member");
    throw new HTTPException(400, { message: "Invalid request" });
  }

  const discordId = member.user.id;
  const result = parseCommand(interaction.data);
  logger.info("Handling slash command", {
    commands: result.commands,
    discordId,
    options: result.options,
  });

  const response = match(result)
    .with({ commands: ["ping"] }, (): APIInteractionResponse => handlers.ping.handle())
    .with(
      {
        commands: ["room", "register", "student-card"],
        options: P.select({ id: P.number }),
      },
      async ({ id }) => await handlers.registerStudentCard.handle(discordId, id),
    )
    .with(
      {
        commands: ["room", "register", "nfc-card"],
        options: P.select({ code: P.string, name: P.string }),
      },
      async ({ code, name }) => await handlers.registerNfcCard.handle(discordId, code, name),
    )
    .with(
      {
        commands: ["room", "force-exit"],
        options: P.select({ user: P.string }),
      },
      async ({ user }) => {
        if (!isAdmin(interaction.member, adminRoleId)) {
          logger.warn("Rejected force-exit command from non-admin", {
            discordId,
            user,
          });
          return FORBIDDEN;
        }

        const targetUserId = parseForceExitTargetUserId(user);
        if (!targetUserId) {
          logger.warn("Rejected force-exit command with invalid user id", {
            discordId,
            user,
          });
          return handleUnknownCommand(JSON.stringify(interaction.data, null, 2));
        }

        return await handlers.forceExitConfirm.handle(targetUserId);
      },
    )
    .with({ commands: ["room", "list"] }, async () => await handlers.listUsers.handle())
    .with(
      {
        commands: ["room-admin", "setting", "register"],
        options: P.select({ allow: P.boolean.optional() }),
      },
      () => {
        logger.info("Received not implemented slash command", {
          commands: result.commands,
          discordId,
        });
        return NOT_IMPLEMENTED;
      },
    )
    .with(P._, () => {
      logger.warn("Received unknown slash command", {
        commands: result.commands,
        discordId,
        options: result.options,
      });
      return handleUnknownCommand(JSON.stringify(interaction.data, null, 2));
    })
    .exhaustive();

  const resolved = await response;
  logger.info("Handled slash command", {
    commands: result.commands,
    discordId,
  });
  return resolved;
}

export async function handleSlashCommandAutocomplete(
  handlers: SlashCommandHandlers,
  interaction: APIApplicationCommandAutocompleteInteraction,
  adminRoleId: string | undefined,
  logger: AppLogger = noopLogger,
): Promise<APIInteractionResponse> {
  const member = interaction.member;
  if (!member) {
    logger.warn("Autocomplete interaction did not include member");
    throw new HTTPException(400, { message: "Invalid request" });
  }

  const discordId = member.user.id;
  const result = parseCommand(
    interaction.data as APIChatInputApplicationCommandInteraction["data"],
  );
  logger.info("Handling slash command autocomplete", {
    commands: result.commands,
    discordId,
    options: result.options,
  });

  const response = await match(result)
    .with(
      {
        commands: ["room", "force-exit"],
        options: P.select({ user: P.string.optional() }),
      },
      async ({ user }) => {
        if (!isAdmin(interaction.member, adminRoleId)) {
          logger.warn("Rejected force-exit autocomplete from non-admin", {
            discordId,
          });
          return {
            type: InteractionResponseType.ApplicationCommandAutocompleteResult,
            data: {
              choices: [],
            },
          } satisfies APIInteractionResponse;
        }

        return await handlers.forceExitAutocomplete.handle(user ?? "");
      },
    )
    .with(P._, () => {
      logger.warn("Received unknown slash command autocomplete", {
        commands: result.commands,
        discordId,
        options: result.options,
      });
      return {
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: {
          choices: [],
        },
      } satisfies APIInteractionResponse;
    })
    .exhaustive();

  logger.info("Handled slash command autocomplete", {
    commands: result.commands,
    discordId,
  });

  return response;
}

export async function handleMessageComponentInteraction(
  handlers: SlashCommandHandlers,
  interaction: APIMessageComponentInteraction,
  adminRoleId: string | undefined,
  logger: AppLogger = noopLogger,
): Promise<APIInteractionResponse> {
  const member = interaction.member;
  if (!member) {
    logger.warn("Message component interaction did not include member");
    throw new HTTPException(400, { message: "Invalid request" });
  }

  const customId = interaction.data.custom_id;
  const discordId = member.user.id;
  logger.info("Handling message component interaction", {
    customId,
    discordId,
  });

  const [prefix, action, userIdText] = customId.split(":");
  if (prefix !== "force_exit") {
    logger.warn("Received unknown message component interaction", {
      customId,
      discordId,
    });
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [
          {
            title: "エラー",
            description: "不明な操作です。",
            color: colorToHex("red"),
          },
        ],
        flags: MessageFlags.Ephemeral,
      },
    };
  }

  if (!isAdmin(interaction.member, adminRoleId)) {
    logger.warn("Rejected force-exit component interaction from non-admin", {
      customId,
      discordId,
    });
    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        embeds: [
          {
            title: "権限がありません",
            description: "このコマンドはAdmin権限を持つユーザーのみ実行できます。",
            color: colorToHex("red"),
          },
        ],
        components: [],
      },
    };
  }

  const targetUserId = parseForceExitTargetUserId(userIdText);
  if (!targetUserId) {
    logger.warn("Rejected force-exit component interaction with invalid user id", {
      customId,
      discordId,
    });
    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        embeds: [
          {
            title: "エラー",
            description: "対象ユーザーの指定が不正です。",
            color: colorToHex("red"),
          },
        ],
        components: [],
      },
    };
  }

  switch (action) {
    case "confirm":
      return await handlers.forceExitExecute.handle(targetUserId);
    case "cancel":
      return await handlers.forceExitCancel.handle(targetUserId);
    default:
      logger.warn("Received force-exit component interaction with unknown action", {
        action,
        customId,
        discordId,
      });
      return {
        type: InteractionResponseType.UpdateMessage,
        data: {
          embeds: [
            {
              title: "エラー",
              description: "不明な操作です。",
              color: colorToHex("red"),
            },
          ],
          components: [],
        },
      };
  }
}
