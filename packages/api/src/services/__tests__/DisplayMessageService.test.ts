import type { KVNamespace } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import { DISPLAY_MESSAGE_MAX_LENGTH, DisplayMessageService } from "../DisplayMessageService";

function createKv() {
  const store = new Map<string, string>();
  const kv = {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

describe("DisplayMessageService", () => {
  it("未登録なら空文字列を返す", async () => {
    const { kv } = createKv();
    expect(await new DisplayMessageService(kv).get()).toBe("");
  });

  it("前後の空白を除き、連続する空白をまとめて保存する", async () => {
    const { kv } = createKv();
    const service = new DisplayMessageService(kv);

    expect(await service.set("  今日は\n 18 時まで  ")).toBe("今日は 18 時まで");
    expect(await service.get()).toBe("今日は 18 時まで");
  });

  it("省略や空白だけの文字列は登録を消す", async () => {
    const { kv, store } = createKv();
    const service = new DisplayMessageService(kv);
    await service.set("合宿中");

    expect(await service.set("   ")).toBe("");
    expect(store.size).toBe(0);
    await service.set("合宿中");
    expect(await service.set(undefined)).toBe("");
    expect(await service.get()).toBe("");
  });

  it("最大長を超える部分を切り捨てる", async () => {
    const { kv } = createKv();
    const saved = await new DisplayMessageService(kv).set(
      "あ".repeat(DISPLAY_MESSAGE_MAX_LENGTH + 5),
    );
    expect(saved).toBe("あ".repeat(DISPLAY_MESSAGE_MAX_LENGTH));
  });
});
