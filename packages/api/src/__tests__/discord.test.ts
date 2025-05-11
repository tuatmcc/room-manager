import type {
	APIApplicationCommandInteractionDataOption,
	APIChatInputApplicationCommandInteractionData,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";

import { parseCommand } from "../discord";

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
