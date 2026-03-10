import type { APIEmbed, APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type {
  RegisterStudentCardError,
  RegisterStudentCardResult,
  RegisterStudentCardUseCase,
} from "@/usecase/RegisterStudentCard";

export class RegisterStudentCardHandler {
  constructor(
    private readonly usecase: RegisterStudentCardUseCase,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(discordId: string, studentId: number): Promise<APIInteractionResponse> {
    this.logger.info("Handling register student card command", {
      discordId,
      studentId,
    });
    const result = await this.usecase.execute(discordId, studentId);

    const embed = result.match<APIEmbed>(
      (result) => this.handleSuccess(result),
      (error) => this.handleError(error),
    );
    this.logger.info("Handled register student card command", {
      discordId,
      studentId,
    });

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      },
    };
  }

  private handleSuccess({ status }: RegisterStudentCardResult): APIEmbed {
    this.logger.info("Register student card command succeeded", {
      status,
    });
    switch (status) {
      case "created":
        return {
          color: colorToHex("green"),
          title: "学生証を登録しました🎉",
          description: "学生証をリーダーにタッチすることで入退出が可能です。",
        };
      case "updated":
        return {
          color: colorToHex("green"),
          title: "学生証を更新しました🎉",
          description:
            "学生証をリーダーにタッチすることで入退出が可能です。なお元の学生証は無効になります。",
        };
    }
  }

  private handleError(error: RegisterStudentCardError): APIEmbed {
    this.logger.error("Register student card command failed", {
      errorCode: error.meta.code,
    });
    switch (error.meta.code) {
      case "STUDENT_CARD_ALREADY_REGISTERED":
        return {
          color: colorToHex("red"),
          title: "学生証の登録に失敗しました",
          description: "すでに登録されている学籍番号です。",
        };
      case "UNKNOWN":
        return {
          color: colorToHex("red"),
          title: "学生証の登録に失敗しました",
          description:
            "不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
        };
      default:
        error.meta satisfies never;
        return error.meta;
    }
  }
}
