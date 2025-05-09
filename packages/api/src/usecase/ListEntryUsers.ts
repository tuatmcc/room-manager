import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";
import { tracer } from "@/trace";

export class ListEntryUsersUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly discordService: DiscordService,
	) {}

	async execute(): Promise<Result<Message, AppError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.list_entry_users",
			async (span): Promise<Result<Message, AppError>> => {
				try {
					const users = await this.userRepository.findAllEntryUsers();
					span.setAttribute("room_manager.user.count", users.length);

					if (users.length === 0) {
						return ok({
							author: "入室中のメンバー",
							description: "部室には誰も居ません",
							color: "red",
						});
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
						`${users.length}人が入室中です`,
						...names.map((n) => `* ${n}`),
					].join("\n");

					return ok({
						author: "入室中のメンバー",
						description,
					});
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new AppError("Failed to register nfc card.", {
						cause,
						errorCode: ERROR_CODE.UNKNOWN,
						userMessage: {
							title: "入室者一覧の取得に失敗しました",
							description:
								"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
						},
					});

					span.recordException(error);
					return err(error);
				} finally {
					span.end();
				}
			},
		);
	}
}
