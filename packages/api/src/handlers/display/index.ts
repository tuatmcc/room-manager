import type { Context } from "hono";

import type { AppEnv, Env } from "@/env";
import type { AppLogger } from "@/logger";
import { noopLogger } from "@/logger";
import type { ListEntryUsersUseCase } from "@/usecase/ListEntryUsers";

import type { DisplaySnapshot } from "./page";
import { renderDisplayPage } from "./page";
import { isValidDisplayToken } from "./token";

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/**
 * 部室の入室人数を電子ペーパー端末(DPT-S1)向けに表示するハンドラ。
 *
 * 端末のブラウザは TLS 1.0 までしか話せないため HTTP で提供される。
 * 平文になるのでトークン(URL)を秘密情報として扱い、表示する情報は入室人数だけに限る。
 */
export class DisplayHandler {
  constructor(
    private readonly usecase: ListEntryUsersUseCase,
    private readonly expectedToken: Env["DISPLAY_TOKEN"],
    private readonly logger: AppLogger = noopLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handlePage(c: Context<AppEnv>): Promise<Response> {
    const token = c.req.param("token") ?? "";
    const snapshot = await this.authorizedSnapshot(token);
    if (!snapshot) return this.notFound(c);

    const html = renderDisplayPage(snapshot, `/display/${encodeURIComponent(token)}/count`);
    return c.html(html, 200, {
      ...COMMON_HEADERS,
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'self'",
    });
  }

  async handleCount(c: Context<AppEnv>): Promise<Response> {
    const token = c.req.param("token") ?? "";
    const snapshot = await this.authorizedSnapshot(token);
    if (!snapshot) return this.notFound(c);

    return c.json(snapshot, 200, COMMON_HEADERS);
  }

  private notFound(c: Context<AppEnv>): Response {
    // 存在自体を隠すため 401 ではなく 404 を返す
    return c.text("Not Found", 404, COMMON_HEADERS);
  }

  private async authorizedSnapshot(token: string): Promise<DisplaySnapshot | undefined> {
    if (!(await isValidDisplayToken(token, this.expectedToken))) {
      this.logger.warn("Display token was missing or invalid");
      return undefined;
    }

    const result = await this.usecase.execute();
    if (result.isErr()) {
      // 取得に失敗したときに「0 人」と誤表示しないよう、エラーは例外として扱う
      throw result.error;
    }

    return { count: result.value.users.length, serverTime: this.now().getTime() };
  }
}

export function createDisplayHandler(
  usecase: ListEntryUsersUseCase,
  env: Env,
  logger: AppLogger,
): DisplayHandler {
  return new DisplayHandler(usecase, env.DISPLAY_TOKEN, logger.child({ tag: "display" }));
}
