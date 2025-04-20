import { SlashCommandBuilder } from "@discordjs/builders";

export const pingCommand = new SlashCommandBuilder()
	.setName("ping")
	.setDescription("pingをBotに送ります。");

export const roomCommand = new SlashCommandBuilder()
	.setName("room")
	.setDescription("入退出システムを操作します。")
	.addSubcommandGroup((group) =>
		group
			.setName("register")
			.setDescription("学生証またはSuicaを登録します。")
			.addSubcommand((subcommand) =>
				subcommand
					.setName("student-card")
					.setDescription("学生証を登録します。")
					.addIntegerOption((option) =>
						option
							.setName("student-id")
							.setNameLocalization("ja", "学籍番号")
							.setDescription("学籍番号")
							.setRequired(true),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("suica")
					.setDescription("Suicaを登録します。")
					.addStringOption((option) =>
						option
							.setName("idm")
							.setDescription("SuicaのIDm")
							.setRequired(true),
					),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand.setName("list").setDescription("現在部室にいる人を表示します。"),
	);

export const roomAdminCommand = new SlashCommandBuilder()
	.setName("room-admin")
	.setDescription("入退出システムの管理を行います。")
	.addSubcommandGroup((group) =>
		group
			.setName("setting")
			.setDescription(
				"設定を操作します。設定値を省略すると現在の値を表示します。",
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("register")
					.setDescription("新規登録の許可")
					.addBooleanOption((option) =>
						option
							.setName("allow")
							.setNameLocalization("ja", "許可")
							.setDescription("登録を許可するかどうか"),
					),
			),
	);
