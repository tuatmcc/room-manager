import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export class TouchStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
	) {}

	async execute(studentId: number): Promise<Result<void, AppError>> {
		try {
			const user = await this.userRepository.findByStudentId(studentId);
			if (!user) {
				return err(
					new AppError("Student card not registered.", {
						userMessage: "登録されていない学生証です。",
					}),
				);
			}

			const now = Temporal.Now.instant();

			const oldLastEntryLog =
				await this.roomEntryLogRepository.findLastEntryByUserId(user.id);
			// すでに入室している場合は、入室ログを更新して終了
			if (oldLastEntryLog) {
				const newLastEntryLog = oldLastEntryLog.exitRoom(now);
				await this.roomEntryLogRepository.save(newLastEntryLog);

				return ok();
			}

			// 入室していない場合は入室ログを新規作成
			await this.roomEntryLogRepository.create(user.id, now);

			return ok();
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to touch card.", {
					cause,
					userMessage: "カードのタッチに失敗しました。",
				}),
			);
		}
	}
}
