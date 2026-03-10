import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "@/env";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import { User } from "@/models/User";
import { TouchCardError } from "@/usecase/TouchCard";

import { TouchCardPresenter } from "./touch-card-presenter";

const createEnv = (): Env =>
  ({
    API_TOKEN: "token",
    DISCORD_PUBLIC_KEY: "public-key",
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: "guild-id",
    DISCORD_CHANNEL_ID: "channel-id",
    DISCORD_ROOM_COMMAND_ID: "123456",
    DISCORD_ROOM_ADMIN_COMMAND_ID: "654321",
    DB: {} as D1Database,
    KV: {} as KVNamespace,
  }) satisfies Env;

describe("TouchCardPresenter", () => {
  it("成功時に HTTP response と Discord embed を組み立てること", async () => {
    const discordService = {
      fetchUserInfo: vi.fn().mockResolvedValue({
        name: "Alice",
        iconUrl: "https://example.com/icon.png",
      }),
    };
    const presenter = new TouchCardPresenter(discordService as never, createEnv());

    const presentation = await presenter.present(
      ok({
        status: "entry",
        entries: 3,
        user: new User(1, "discord-user"),
      }),
    );

    expect(discordService.fetchUserInfo).toHaveBeenCalledWith("discord-user");
    expect(presentation.response).toEqual({
      success: true,
      status: "entry",
      entries: 3,
    });
    expect(presentation.embed.title).toContain("Aliceさんが入室しました");
    expect(presentation.embed.description).toContain("3人が入室中です");
  });

  it("未登録 NFC カード時に登録案内を返すこと", async () => {
    const presenter = new TouchCardPresenter(
      {
        fetchUserInfo: vi.fn(),
      } as never,
      createEnv(),
    );
    const error = new TouchCardError("NFC card not registered.", {
      meta: {
        code: "NFC_CARD_NOT_REGISTERED",
        unknownNfcCard: new UnknownNfcCard(1, "0420", "idm"),
      },
    });

    const presentation = await presenter.present(err(error));

    expect(presentation.response).toEqual({
      success: false,
      error: "NFC card not registered.",
      error_code: "NFC_CARD_NOT_REGISTERED",
    });
    expect(presentation.embed.description).toContain("0420");
  });
});
