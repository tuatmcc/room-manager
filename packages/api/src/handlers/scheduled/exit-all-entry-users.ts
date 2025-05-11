import type {
	APIEmbed,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";

import { colorToHex } from "@/discord";
import type { DiscordService } from "@/services/DiscordService";
import type {
	ExitAllEntryUsersError,
	ExitAllEntryUsersResult,
	ExitAllEntryUsersUseCase,
} from "@/usecase/ExitAllEntryUsers";
import type { MaybePromise } from "@/utils";

export class ExitAllEntryUsersHandler {
	constructor(
		private readonly usecase: ExitAllEntryUsersUseCase,
		private readonly discordService: DiscordService,
	) {}

	async handle(): Promise<void> {
		const result = await this.usecase.execute();

		const embed = await result.match<MaybePromise<APIEmbed | null>>(
			async (result) => await this.handleSuccess(result),
			(error) => this.handleError(error),
		);
		if (embed === null) return;

		const message: RESTPostAPIChannelMessageJSONBody = {
			embeds: [embed],
		};
		await this.discordService.sendMessage(message);
	}

	private async handleSuccess({
		users,
	}: ExitAllEntryUsersResult): Promise<APIEmbed | null> {
		if (users.length === 0) {
			return null;
		}

		const names = await Promise.all(
			users.map(async (user) => {
				const { name } = await this.discordService.fetchUserInfo(
					user.discordId,
				);
				return name;
			}),
		);

		const description = [
			"以下のメンバーを自動的に退出させました。退出を忘れないようにしましょう！",
			...names.map((n) => `* ${n}`),
		].join("\n");

		return {
			color: colorToHex("red"),
			title: "自動退出",
			description,
		};
	}

	private handleError(error: ExitAllEntryUsersError): APIEmbed {
		switch (error.meta.code) {
			// eslint-disable-next-line typescript/no-unnecessary-condition
			case "UNKNOWN":
				return {
					color: colorToHex("red"),
					title: "自動退出に失敗しました",
					description:
						"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
				};
		}
	}
}
