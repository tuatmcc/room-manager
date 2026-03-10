import type { KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { interactionVerifier } from "../discord";
import type { AppEnv, Env } from "../env";

const { verifyKeyMock } = vi.hoisted(() => ({
  verifyKeyMock: vi.fn(),
}));

vi.mock("discord-interactions", () => ({
  verifyKey: verifyKeyMock,
}));

function createEnv(): Env {
  return {
    API_TOKEN: "token",
    DISCORD_PUBLIC_KEY: "public-key",
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: "guild-id",
    DISCORD_CHANNEL_ID: "channel-id",
    DISCORD_ROOM_COMMAND_ID: "room-command-id",
    DISCORD_ROOM_ADMIN_COMMAND_ID: "room-admin-command-id",
    DB: {} as D1Database,
    KV: {} as KVNamespace,
  };
}

describe("interactionVerifier", () => {
  beforeEach(() => {
    verifyKeyMock.mockReset();
  });

  it("検証済みの raw body を後続 handler で再利用できること", async () => {
    verifyKeyMock.mockResolvedValue(true);

    const app = new Hono<AppEnv>()
      .use(async (c, next) => {
        c.set("env", createEnv());
        await next();
      })
      .post("/", interactionVerifier, (c) => {
        return c.json(JSON.parse(c.get("verifiedInteractionBody") ?? "{}"));
      });

    const response = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Ed25519": "signature",
        "X-Signature-Timestamp": "timestamp",
      },
      body: JSON.stringify({ type: 1 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 1 });
    expect(verifyKeyMock).toHaveBeenCalledWith(
      JSON.stringify({ type: 1 }),
      "signature",
      "timestamp",
      "public-key",
    );
  });
});
