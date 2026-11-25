import type { KVNamespace } from "@cloudflare/workers-types";

import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";

/** 入室人数表示ページに出す任意の文字列の最大長(Discord のオプションでも同じ値で制限する) */
export const DISPLAY_MESSAGE_MAX_LENGTH = 40;

const DISPLAY_MESSAGE_KEY = "display:message";

/**
 * `/room display` で登録された、入室人数表示ページ用の文字列を KV に保存する。
 *
 * KV は結果整合のため、更新が表示ページに反映されるまで最大で 60 秒程度かかることがある。
 */
export class DisplayMessageService {
  constructor(
    private readonly kv: KVNamespace,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  /** 登録されている文字列を返す。未登録なら空文字列 */
  async get(): Promise<string> {
    return (await this.kv.get(DISPLAY_MESSAGE_KEY)) ?? "";
  }

  /** 文字列を登録する。前後の空白を除いて空になる場合は登録を消す。保存した値を返す */
  async set(message: string | undefined): Promise<string> {
    const normalized = normalizeDisplayMessage(message);
    if (normalized === "") {
      await this.kv.delete(DISPLAY_MESSAGE_KEY);
      this.logger.info("Cleared display message");
    } else {
      await this.kv.put(DISPLAY_MESSAGE_KEY, normalized);
      this.logger.info("Updated display message", { length: normalized.length });
    }
    return normalized;
  }
}

export function normalizeDisplayMessage(message: string | undefined): string {
  return Array.from((message ?? "").replace(/\s+/g, " ").trim())
    .slice(0, DISPLAY_MESSAGE_MAX_LENGTH)
    .join("");
}
