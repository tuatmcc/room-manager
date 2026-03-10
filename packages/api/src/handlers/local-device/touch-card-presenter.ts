import { Temporal } from "@js-temporal/polyfill";
import type { APIEmbed } from "discord-api-types/v10";
import type { Result } from "neverthrow";

import { colorToHex } from "@/discord";
import type { Env } from "@/env";
import type { DiscordService } from "@/services/DiscordService";
import type { TouchCardError, TouchCardResult } from "@/usecase/TouchCard";

import type { TouchCardResponse } from "./touch-card-contract";

export interface TouchCardPresentation {
  embed: APIEmbed;
  response: TouchCardResponse;
}

export class TouchCardPresenter {
  constructor(
    private readonly discordService: DiscordService,
    private readonly env: Env,
  ) {}

  async present(result: Result<TouchCardResult, TouchCardError>): Promise<TouchCardPresentation> {
    return await result.match(
      async (success) => await this.presentSuccess(success),
      (error) => this.presentError(error),
    );
  }

  private async presentSuccess(result: TouchCardResult): Promise<TouchCardPresentation> {
    const userInfo = await this.discordService.fetchUserInfo(result.user.discordId);

    const memberCount =
      result.entries === 0 ? "部室には誰も居ません" : `${result.entries}人が入室中です`;

    const nowEpochSeconds = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
    const timestamp = `<t:${nowEpochSeconds}:R>`;

    return {
      embed: {
        author: {
          name: "入退出通知",
        },
        title: `${userInfo.name}さんが${result.status === "entry" ? "入室" : "退出"}しました`,
        description: [memberCount, timestamp].join("\n\n"),
        thumbnail: {
          url: userInfo.iconUrl,
        },
        color: colorToHex(result.status === "entry" ? "green" : "red"),
      },
      response: {
        success: true,
        status: result.status,
        entries: result.entries,
      },
    };
  }

  private presentError(error: TouchCardError): TouchCardPresentation {
    const embed: APIEmbed = (() => {
      switch (error.meta.code) {
        case "STUDENT_CARD_NOT_REGISTERED":
          return {
            title: "登録されていない学生証です",
            description: `</room register student-card:${this.env.DISCORD_ROOM_COMMAND_ID}>で学生証を登録してください。`,
            color: colorToHex("red"),
          };
        case "NFC_CARD_NOT_REGISTERED":
          return {
            title: "登録されていないNFCカードです",
            description: `</room register nfc-card:${this.env.DISCORD_ROOM_COMMAND_ID}>で\`${error.meta.unknownNfcCard.code}\`を使用してNFCカードを登録してください。`,
            color: colorToHex("red"),
          };
        case "UNKNOWN":
          return {
            title: "エラーが発生しました",
            description: "エラーが発生しました。管理者に連絡してください。",
            color: colorToHex("red"),
          };
      }
    })();

    return {
      embed,
      response: {
        success: false,
        error: error.message,
        error_code: error.meta.code,
      },
    };
  }
}
