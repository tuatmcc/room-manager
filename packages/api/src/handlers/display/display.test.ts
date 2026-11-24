import { Hono } from "hono";
import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/env";
import type { ListEntryUsersUseCase } from "@/usecase/ListEntryUsers";
import { ListEntryUsersError } from "@/usecase/ListEntryUsers";

import { DisplayHandler } from ".";

const TOKEN = "t".repeat(40);

function createApp(execute: ReturnType<typeof vi.fn>, expectedToken: string | undefined) {
  const handler = new DisplayHandler(
    { execute } as unknown as ListEntryUsersUseCase,
    expectedToken,
    undefined,
    () => new Date("2026-11-24T03:04:00Z"),
  );
  return new Hono<AppEnv>()
    .get("/display/:token", (c) => handler.handlePage(c))
    .get("/display/:token/count", (c) => handler.handleCount(c));
}

const users = (n: number) => ({ users: Array.from({ length: n }, () => ({})) });

describe("DisplayHandler", () => {
  it("正しいトークンで入室人数のページを返す", async () => {
    const execute = vi.fn().mockResolvedValue(ok(users(4)));
    const res = await createApp(execute, TOKEN).request(`/display/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await res.text();
    expect(body).toContain('class="number">4</span>');
    expect(body).toContain("12:04");
    expect(body).toContain(`/display/${TOKEN}/count`);
  });

  it("JSON エンドポイントが人数と更新時刻を返す", async () => {
    const execute = vi.fn().mockResolvedValue(ok(users(0)));
    const res = await createApp(execute, TOKEN).request(`/display/${TOKEN}/count`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, updatedAt: "12:04" });
  });

  it("誤ったトークンは 404 で、データを取得しない", async () => {
    const execute = vi.fn();
    const app = createApp(execute, TOKEN);

    expect((await app.request("/display/wrong")).status).toBe(404);
    expect((await app.request("/display/wrong/count")).status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });

  it("DISPLAY_TOKEN 未設定ならページを無効にする", async () => {
    const execute = vi.fn();
    const res = await createApp(execute, undefined).request(`/display/${TOKEN}`);

    expect(res.status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });

  it("取得失敗時は 0 人と誤表示せずエラーにする", async () => {
    const failure = new ListEntryUsersError("fail", { meta: { code: "UNKNOWN" } });
    const execute = vi.fn().mockResolvedValue(err(failure));
    const res = await createApp(execute, TOKEN).request(`/display/${TOKEN}/count`);

    expect(res.status).toBe(500);
  });
});
