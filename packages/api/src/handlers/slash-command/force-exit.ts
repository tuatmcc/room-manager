import type {
  APIEmbed,
  APIInteractionResponse,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type { DiscordService } from "@/services/DiscordService";
import type {
  ForceExitEntryUserError,
  ForceExitEntryUserResult,
  ForceExitEntryUserUseCase,
} from "@/usecase/ForceExitEntryUser";
import type { ListEntryUsersUseCase } from "@/usecase/ListEntryUsers";

interface ForceExitConfirmPayload {
  embed: APIEmbed;
  components?: APIMessageTopLevelComponent[];
}

export class ForceExitAutocompleteHandler {
  constructor(
    private readonly listEntryUsersUseCase: ListEntryUsersUseCase,
    private readonly discordService: DiscordService,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(focusedValue: string): Promise<APIInteractionResponse> {
    this.logger.info("handling force-exit autocomplete", { focusedValue });
    const result = await this.listEntryUsersUseCase.execute();

    const choices = await result.match(
      async ({ users }) => {
        const userInfos = await Promise.all(
          users.map(async (user) => {
            const { name } = await this.discordService.fetchUserInfo(user.discordId);
            return {
              name,
              value: String(user.id),
            };
          }),
        );

        const keyword = focusedValue.trim().toLocaleLowerCase();
        const filtered =
          keyword.length === 0
            ? userInfos
            : userInfos.filter((userInfo) => userInfo.name.toLocaleLowerCase().includes(keyword));
        return filtered.slice(0, 25);
      },
      () => [],
    );

    this.logger.info("handled force-exit autocomplete", {
      choiceCount: choices.length,
      focusedValue,
    });

    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices,
      },
    };
  }
}

export class ForceExitConfirmHandler {
  constructor(
    private readonly listEntryUsersUseCase: ListEntryUsersUseCase,
    private readonly discordService: DiscordService,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(targetUserId: number): Promise<APIInteractionResponse> {
    this.logger.info("handling force-exit confirmation", { targetUserId });
    const result = await this.listEntryUsersUseCase.execute();

    const payload = await result.match<Promise<ForceExitConfirmPayload>>(
      async ({ users }) => {
        const targetUser = users.find((user) => user.id === targetUserId);
        if (!targetUser) {
          return {
            embed: {
              color: colorToHex("red"),
              title: "対象ユーザーが見つかりません",
              description: "対象ユーザーは現在入室していません。",
            } satisfies APIEmbed,
          } satisfies ForceExitConfirmPayload;
        }

        const userInfo = await this.discordService.fetchUserInfo(targetUser.discordId);
        return {
          embed: {
            color: colorToHex("red"),
            title: "強制退出確認",
            description: `${userInfo.name} を退出扱いとします。よろしいですか？`,
          } satisfies APIEmbed,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Danger as const,
                  custom_id: `force_exit:confirm:${targetUser.id}`,
                  label: "はい",
                },
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Secondary as const,
                  custom_id: `force_exit:cancel:${targetUser.id}`,
                  label: "いいえ",
                },
              ],
            },
          ],
        } satisfies ForceExitConfirmPayload;
      },
      async () =>
        ({
          embed: {
            color: colorToHex("red"),
            title: "対象ユーザーが見つかりません",
            description:
              "入室中メンバーの取得に失敗しました。時間をおいて再度お試しください。問題が続く場合は管理者にご連絡ください。",
          } satisfies APIEmbed,
        }) satisfies ForceExitConfirmPayload,
    );

    this.logger.info("handled force-exit confirmation", {
      targetUserId,
      hasComponents: payload.components != null,
    });

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [payload.embed],
        components: payload.components,
        flags: MessageFlags.Ephemeral,
      },
    };
  }
}

export class ForceExitExecuteHandler {
  constructor(
    private readonly useCase: ForceExitEntryUserUseCase,
    private readonly discordService: DiscordService,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(targetUserId: number): Promise<APIInteractionResponse> {
    this.logger.info("handling force-exit execution", { targetUserId });
    const result = await this.useCase.execute(targetUserId);

    const embed = await result.match<Promise<APIEmbed>>(
      async (value) => await this.handleSuccess(value),
      async (error) => await this.handleError(error),
    );

    this.logger.info("handled force-exit execution", {
      targetUserId,
      succeeded: result.isOk(),
    });

    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        embeds: [embed],
        components: [],
      },
    };
  }

  private async handleSuccess({ user }: ForceExitEntryUserResult): Promise<APIEmbed> {
    const userInfo = await this.discordService.fetchUserInfo(user.discordId);
    return {
      color: colorToHex("green"),
      title: "強制退出完了",
      description: `${userInfo.name} を退出扱いとしました。`,
    };
  }

  private async handleError(error: ForceExitEntryUserError): Promise<APIEmbed> {
    this.logger.warn("force-exit execution failed", {
      errorCode: error.meta.code,
    });
    switch (error.meta.code) {
      case "TARGET_NOT_IN_ROOM":
        return {
          color: colorToHex("red"),
          title: "退出処理に失敗しました",
          description: "対象ユーザーは現在入室していません。",
        };
      case "TARGET_USER_NOT_FOUND":
        return {
          color: colorToHex("red"),
          title: "退出処理に失敗しました",
          description:
            "対象ユーザー情報を取得できませんでした。時間をおいて再度お試しください。問題が続く場合は管理者にご連絡ください。",
        };
      case "UNKNOWN":
        return {
          color: colorToHex("red"),
          title: "退出処理に失敗しました",
          description:
            "不明なエラーです。時間をおいて再度お試しください。問題が続く場合は管理者にご連絡ください。",
        };
      default:
        return {
          color: colorToHex("red"),
          title: "退出処理に失敗しました",
          description:
            "不明なエラーです。時間をおいて再度お試しください。問題が続く場合は管理者にご連絡ください。",
        };
    }
  }
}

export class ForceExitCancelHandler {
  constructor(
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(targetUserId: number): Promise<APIInteractionResponse> {
    this.logger.info("handling force-exit cancellation", { targetUserId });
    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        embeds: [
          {
            color: colorToHex("green"),
            title: "強制退出を中止しました",
            description: "処理をキャンセルしました。",
          },
        ],
        components: [],
      },
    };
  }
}
