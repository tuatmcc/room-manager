import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export class ExitAllEntryUsersUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
	) {}

	async execute(): Promise<Result<Message | null, AppError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.exit_all_entry_users",
			async (span): Promise<Result<Message | null, AppError>> => {
				try {
					const entryLogs = await this.roomEntryLogRepository.findAllEntry();
					span.setAttribute(
						"room_manager.room_entry_log.count",
						entryLogs.length,
					);
					if (entryLogs.length === 0) {
						return ok(null);
					}

					const now = Temporal.Now.instant();
					await this.roomEntryLogRepository.setManyExitAt(
						entryLogs.map((log) => log.id),
						now,
					);

					const users = await this.userRepository.findByIds(
						entryLogs.map((log) => log.userId),
					);

					const title = "自動退出";
					const description = [
						"以下のメンバーを自動的に退出させました。退出を忘れないようにしましょう！",
						...users.map((user) => `* <@${user.discordId}>`),
					].join("\n");

					return ok({
						title,
						description,
						color: "red",
					});
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new AppError("Failed to register nfc card.", {
						cause,
						errorCode: ERROR_CODE.UNKNOWN,
						userMessage: {
							title: "自動退出に失敗しました",
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
