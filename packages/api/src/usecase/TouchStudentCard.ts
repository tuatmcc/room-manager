import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { Message } from "@/message";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";

export type TouchStudentCardStatus = "entry" | "exit";

export interface TouchStudentCardResponse {
	status: TouchStudentCardStatus;
	message: Message;
}

export class TouchStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
		private readonly discordService: DiscordService,
	) {}

	async execute(
		studentId: number,
	): Promise<Result<TouchStudentCardResponse, AppError>> {
		try {
			const user = await this.userRepository.findByStudentId(studentId);
			if (!user) {
				return err(
					new AppError("Student card not registered.", {
						userMessage: {
							title: "登録されていない学生証です",
							description:
								"`/room-manager register student-card`コマンドで学生証を登録してください。",
						},
					}),
				);
			}

			const now = Temporal.Now.instant();
			const { iconUrl, name } = await this.discordService.fetchUserInfo(
				user.discordId,
			);

			const oldLastEntryLog =
				await this.roomEntryLogRepository.findLastEntryByUserId(user.id);
			// すでに入室している場合は、入室ログを更新して終了
			if (oldLastEntryLog) {
				const newLastEntryLog = oldLastEntryLog.exitRoom(now);
				await this.roomEntryLogRepository.save(newLastEntryLog);

				// 入室中のユーザーを取得
				const entryUsers = await this.userRepository.findAllEntryUsers();
				const description = `### 入室中 (${entryUsers.length}人)\n${entryUsers.map((u) => `* <@${u.discordId}>`).join("\n")}`;

				return ok({
					status: "exit",
					message: {
						title: `${name}さんが退出しました`,
						description,
						iconUrl,
						color: "green",
					},
				});
			}

			// 入室していない場合は入室ログを新規作成
			await this.roomEntryLogRepository.create(user.id, now);

			// 入室中のユーザーを取得
			const entryUsers = await this.userRepository.findAllEntryUsers();
			const description = `### 入室中 (${entryUsers.length}人)\n${entryUsers.map((u) => `* <@${u.discordId}>`).join("\n")}`;

			return ok({
				status: "entry",
				message: {
					title: `${name}さんが入室しました`,
					description,
					iconUrl,
					color: "red",
				},
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to touch card.", {
					cause,
					userMessage: {
						title: "入退出に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}
}
