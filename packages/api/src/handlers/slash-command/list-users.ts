import type { APIEmbed, APIInteractionResponse } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { DiscordService } from "@/services/DiscordService";
import type {
	ListEntryUsersError,
	ListEntryUsersResult,
	ListEntryUsersUseCase,
} from "@/usecase/ListEntryUsers";
import type { MaybePromise } from "@/utils";

export class ListUsersHandler {
	constructor(
		private readonly usecase: ListEntryUsersUseCase,
		private readonly discordService: DiscordService,
	) {}

	async handle(): Promise<APIInteractionResponse> {
		const result = await this.usecase.execute();

		const embed = await result.match<MaybePromise<APIEmbed>>(
			async (result) => await this.handleSuccess(result),
			(error) => this.handleError(error),
		);

		return {
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				embeds: [embed],
				flags: MessageFlags.Ephemeral,
			},
		};
	}

	private async handleSuccess({
		users,
	}: ListEntryUsersResult): Promise<APIEmbed> {
		const names = await Promise.all(
			users.map(async (user) => {
				const { name } = await this.discordService.fetchUserInfo(
					user.discordId,
				);
				return name;
			}),
		);

		if (users.length === 0) {
			return {
				color: colorToHex("green"),
				title: "入室中のメンバー",
				description: "部室には誰も居ません",
			};
		}

		const description = [
			`${users.length}人が入室中です`,
			...names.map((n) => `* ${n}`),
		].join("\n");

		return {
			color: colorToHex("green"),
			title: "入室中のメンバー",
			description,
		};
	}

	private handleError(error: ListEntryUsersError): APIEmbed {
		switch (error.meta.code) {
			// eslint-disable-next-line typescript/no-unnecessary-condition
			case "UNKNOWN":
				return {
					color: colorToHex("red"),
					title: "入室中のユーザー一覧の取得に失敗しました",
					description:
						"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
				};
		}
	}
}
