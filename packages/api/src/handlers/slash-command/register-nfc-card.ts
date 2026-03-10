import type { APIEmbed, APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type { RegisterNfcCardError, RegisterNfcCardUseCase } from "@/usecase/RegisterNfcCard";

export class RegisterNfcCardHandler {
  constructor(
    private readonly usecase: RegisterNfcCardUseCase,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(discordId: string, code: string, name: string): Promise<APIInteractionResponse> {
    this.logger.info("Handling register nfc card command", {
      code,
      discordId,
      name,
    });
    const result = await this.usecase.execute(discordId, code, name);

    const embed = result.match<APIEmbed>(
      () => this.handleSuccess(),
      (error) => this.handleError(error),
    );
    this.logger.info("Handled register nfc card command", {
      code,
      discordId,
      name,
    });

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      },
    };
  }

  private handleSuccess(): APIEmbed {
    this.logger.info("Register nfc card command succeeded");
    return {
      color: colorToHex("green"),
      title: "NFCカードを登録しました🎉",
      description: "NFCカードをリーダーにタッチすることで入退出が可能です。",
    };
  }

  private handleError(error: RegisterNfcCardError): APIEmbed {
    this.logger.error("Register nfc card command failed", {
      errorCode: error.meta.code,
    });
    switch (error.meta.code) {
      case "NFC_CARD_ALREADY_REGISTERED":
        return {
          color: colorToHex("red"),
          title: "NFCカードの登録に失敗しました",
          description: "すでに登録されているNFCカードです。",
        };
      case "NFC_CARD_NOT_FOUND":
        return {
          color: colorToHex("red"),
          title: "NFCカードの登録に失敗しました",
          description: "不明なNFCカードです。",
        };
      case "UNKNOWN":
        return {
          color: colorToHex("red"),
          title: "NFCカードの登録に失敗しました",
          description:
            "不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
        };
      default:
        error.meta satisfies never;
        return error.meta;
    }
  }
}
