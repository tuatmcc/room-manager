import type { APIEmbed, APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { DisplayMessageService } from "@/services/DisplayMessageService";

export class SetDisplayMessageHandler {
  constructor(
    private readonly displayMessage: DisplayMessageService,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async handle(discordId: string, message: string | undefined): Promise<APIInteractionResponse> {
    this.logger.info("Handling set display message command", { discordId });

    let embed: APIEmbed;
    try {
      const saved = await this.displayMessage.set(message);
      embed =
        saved === ""
          ? {
              color: colorToHex("green"),
              title: "表示する文字列を消しました",
              description: "入室人数表示ページには人数だけが表示されます。",
            }
          : {
              color: colorToHex("green"),
              title: "表示する文字列を登録しました",
              description: `入室人数表示ページに次の文字列を表示します(反映まで最大 1 分程度かかります)。\n\n${saved}`,
            };
    } catch (error) {
      this.logger.error("Set display message command failed", serializeError(error));
      embed = {
        color: colorToHex("red"),
        title: "表示する文字列の登録に失敗しました",
        description:
          "時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
      };
    }

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      },
    };
  }
}
