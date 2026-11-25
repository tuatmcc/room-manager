import type { APIInteractionResponseChannelMessageWithSource } from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";

import type { DisplayMessageService } from "@/services/DisplayMessageService";

import { SetDisplayMessageHandler } from "../set-display-message";

function createHandler(set: ReturnType<typeof vi.fn>) {
  return new SetDisplayMessageHandler({ set } as unknown as DisplayMessageService);
}

async function embedOf(handler: SetDisplayMessageHandler, message: string | undefined) {
  const res = (await handler.handle(
    "123",
    message,
  )) as APIInteractionResponseChannelMessageWithSource;
  return res.data.embeds?.[0];
}

describe("SetDisplayMessageHandler", () => {
  it("登録した文字列を返信する", async () => {
    const set = vi.fn().mockResolvedValue("合宿中");
    const embed = await embedOf(createHandler(set), "合宿中");

    expect(set).toHaveBeenCalledWith("合宿中");
    expect(embed?.title).toBe("表示する文字列を登録しました");
    expect(embed?.description).toContain("合宿中");
  });

  it("文字列を省略すると消したことを返信する", async () => {
    const set = vi.fn().mockResolvedValue("");
    const embed = await embedOf(createHandler(set), undefined);

    expect(set).toHaveBeenCalledWith(undefined);
    expect(embed?.title).toBe("表示する文字列を消しました");
  });

  it("保存に失敗したらエラーを返信する", async () => {
    const set = vi.fn().mockRejectedValue(new Error("kv"));
    const embed = await embedOf(createHandler(set), "合宿中");

    expect(embed?.title).toBe("表示する文字列の登録に失敗しました");
  });
});
