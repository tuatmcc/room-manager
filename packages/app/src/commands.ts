import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";

export const commands: RESTPostAPIApplicationCommandsJSONBody[] = [
	{
		name: "ping",
		description: "pingをBotに送ります。",
	},
	{
		name: "room-manager",
		description: "部室の管理を行います。",
		options: [
			{
				type: ApplicationCommandOptionType.SubcommandGroup,
				name: "register",
				description: "学生証やSuicaを登録します。",
				options: [
					{
						name: "student-card",
						description: "学生証を登録します。",
						type: ApplicationCommandOptionType.Subcommand,
						options: [
							{
								name: "student-id",
								description: "学籍番号",
								type: ApplicationCommandOptionType.Integer,
								required: true,
							},
						],
					},
					{
						name: "suica",
						description:
							"Suicaを登録します。Suica以外の交通系ICカードも登録できる(かもしれない)。",
						type: ApplicationCommandOptionType.Subcommand,
						options: [
							{
								name: "idm",
								description: "idm",
								type: ApplicationCommandOptionType.String,
								required: true,
							},
						],
					},
				],
			},
		],
	},
];
