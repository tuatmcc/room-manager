import type { DiscordService } from "@/services/DiscordService";
import type { ExitAllEntryUsersUseCase } from "@/usecase/ExitAllEntryUsers";

export class ExitAllEntryUsersHandler {
	constructor(
		private readonly usecase: ExitAllEntryUsersUseCase,
		private readonly discordService: DiscordService,
	) {}

	async handle(): Promise<void> {
		const result = await this.usecase.execute();

		await result.match(
			async (message) => {
				if (message === null) return;
				await this.discordService.sendMessage(message);
			},
			async (err) => {
				await this.discordService.sendMessage(err.userMessage, "error");
			},
		);
	}
}
