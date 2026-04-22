import type {
  APIApplicationCommandInteractionDataOption,
  APIChatInputApplicationCommandInteractionData,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { interactionVerifier, parseCommand } from "../discord";
import type { AppEnv, Env } from "../env";

const verifyKeyMock = vi.hoisted(() => vi.fn());

vi.mock("discord-interactions", () => ({
  verifyKey: verifyKeyMock,
}));

// 完全なテスト用インターフェースを作成
interface MockInteractionData {
  name: string;
  options?: APIApplicationCommandInteractionDataOption[];
}

// 型安全なモック関数
function createMockInteraction(
  mockData: MockInteractionData,
): APIChatInputApplicationCommandInteractionData {
  const data: Partial<APIChatInputApplicationCommandInteractionData> = {
    id: "test-id",
    name: mockData.name,
    type: 1,
    options: mockData.options,
  };

  return data as APIChatInputApplicationCommandInteractionData;
}

describe("parseCommand", () => {
  beforeEach(() => {
    verifyKeyMock.mockReset();
  });

  it("単純なコマンドを正しくパースできること", () => {
    const interaction = createMockInteraction({
      name: "test",
      options: [],
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["test"],
      options: {},
    });
  });

  it("オプション付きのコマンドを正しくパースできること", () => {
    const interaction = createMockInteraction({
      name: "test",
      options: [
        {
          name: "option1",
          type: ApplicationCommandOptionType.String,
          value: "value1",
        },
        {
          name: "option2",
          type: ApplicationCommandOptionType.Integer,
          value: 42,
        },
        {
          name: "option3",
          type: ApplicationCommandOptionType.Boolean,
          value: true,
        },
      ],
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["test"],
      options: {
        option1: "value1",
        option2: 42,
        option3: true,
      },
    });
  });

  it("サブコマンドを正しくパースできること", () => {
    const interaction = createMockInteraction({
      name: "test",
      options: [
        {
          name: "subcommand",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "option1",
              type: ApplicationCommandOptionType.String,
              value: "value1",
            },
          ],
        },
      ],
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["test", "subcommand"],
      options: {
        option1: "value1",
      },
    });
  });

  it("サブコマンドグループを正しくパースできること", () => {
    const interaction = createMockInteraction({
      name: "test",
      options: [
        {
          name: "group",
          type: ApplicationCommandOptionType.SubcommandGroup,
          options: [
            {
              name: "subcommand",
              type: ApplicationCommandOptionType.Subcommand,
              options: [
                {
                  name: "option1",
                  type: ApplicationCommandOptionType.String,
                  value: "value1",
                },
              ],
            },
          ],
        },
      ],
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["test", "group", "subcommand"],
      options: {
        option1: "value1",
      },
    });
  });

  it("複雑なネストされた構造を正しくパースできること", () => {
    const interaction = createMockInteraction({
      name: "user",
      options: [
        {
          name: "manage",
          type: ApplicationCommandOptionType.SubcommandGroup,
          options: [
            {
              name: "add",
              type: ApplicationCommandOptionType.Subcommand,
              options: [
                {
                  name: "name",
                  type: ApplicationCommandOptionType.String,
                  value: "山田太郎",
                },
                {
                  name: "age",
                  type: ApplicationCommandOptionType.Integer,
                  value: 25,
                },
                {
                  name: "is_admin",
                  type: ApplicationCommandOptionType.Boolean,
                  value: false,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["user", "manage", "add"],
      options: {
        name: "山田太郎",
        age: 25,
        is_admin: false,
      },
    });
  });

  it("オプションがない場合も正しく処理できること", () => {
    const interaction = createMockInteraction({
      name: "ping",
    });

    const result = parseCommand(interaction);
    expect(result).toEqual({
      commands: ["ping"],
      options: {},
    });
  });
});

describe("interactionVerifier", () => {
  const createEnv = (): Env =>
    ({
      API_TOKEN: "token",
      DISCORD_PUBLIC_KEY: "public-key",
      DISCORD_BOT_TOKEN: "bot-token",
      DISCORD_GUILD_ID: "guild-id",
      DISCORD_CHANNEL_ID: "channel-id",
      DISCORD_ROOM_COMMAND_ID: "123456",
      DISCORD_ROOM_ADMIN_COMMAND_ID: "654321",
      DISCORD_ADMIN_ROLE_ID: "admin-role-id",
      DB: {} as D1Database,
      KV: {} as KVNamespace,
    }) satisfies Env;

  it("検証済み raw body を context に保持すること", async () => {
    verifyKeyMock.mockResolvedValue(true);
    const app = new Hono<AppEnv>()
      .use(async (c, next) => {
        c.set("env", createEnv());
        await next();
      })
      .post("/interaction", interactionVerifier, (c) =>
        c.json({ body: c.get("verifiedInteractionBody") }),
      );

    const res = await app.request("http://localhost/interaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Ed25519": "signature",
        "X-Signature-Timestamp": "timestamp",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      body: '{"hello":"world"}',
    });
    expect(verifyKeyMock).toHaveBeenCalledWith(
      '{"hello":"world"}',
      "signature",
      "timestamp",
      "public-key",
    );
  });
});
