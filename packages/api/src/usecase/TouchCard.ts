import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";

export type TouchStudentCardStatus = "entry" | "exit";

export interface TouchStudentCardResponse {
	status: TouchStudentCardStatus;
	entries: number;
	message: Message;
}

export class TouchStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
		private readonly discordService: DiscordService,
	) {}

	async execute({
		idm,
		studentId,
	}: {
		idm: string;
		studentId?: number;
	}): Promise<Result<TouchStudentCardResponse, AppError>> {
		try {
			const user =
				studentId != null
					? await this.userRepository.findByStudentId(studentId)
					: await this.userRepository.findBySuicaIdm(idm);
			if (!user) {
				return err(
					new AppError("Student card or Suica not registered.", {
						errorCode:
							studentId != null
								? ERROR_CODE.STUDENT_CARD_NOT_REGISTERED
								: ERROR_CODE.SUICA_CARD_NOT_REGISTERED,
						userMessage: {
							title: `登録されていない${studentId != null ? "学生証" : "Suica"}です`,
							description: `\`/room register ${studentId != null ? "student-card" : "suica"}\`コマンドで${studentId != null ? "学生証" : "Suica"}を登録してください。`,
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
				const description = this.buildEntryUsersMessage(entryUsers);

				return ok({
					status: "exit",
					entries: entryUsers.length,
					message: {
						title: `${name}さんが退出しました`,
						description,
						iconUrl,
						color: "red",
					},
				});
			}

			// 入室していない場合は入室ログを新規作成
			await this.roomEntryLogRepository.create(user.id, now);

			// 入室中のユーザーを取得
			const entryUsers = await this.userRepository.findAllEntryUsers();
			const description = this.buildEntryUsersMessage(entryUsers);

			return ok({
				status: "entry",
				entries: entryUsers.length,
				message: {
					title: `${name}さんが入室しました`,
					description,
					iconUrl,
					color: "green",
				},
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to touch card.", {
					cause,
					errorCode: ERROR_CODE.UNKNOWN,
					userMessage: {
						title: "入退出に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}

	private buildEntryUsersMessage(users: User[]): string {
		if (users.length === 0) {
			return "部室には誰も居ません";
		}

		return [
			`入室中 (${users.length}人)`,
			...users.map((user) => `* <@${user.discordId}>`),
		].join("\n");
	}
}
