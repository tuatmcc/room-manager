import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";

export type TouchCardStatus = "entry" | "exit";

export interface TouchCardResponse {
	status: TouchCardStatus;
	entries: number;
	message: Message;
}

export class TouchCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly unknownNfcCardRepository: UnknownNfcCardRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
		private readonly discordService: DiscordService,
	) {}

	async execute({
		idm,
		studentId,
	}: {
		idm: string;
		studentId?: number;
	}): Promise<Result<TouchCardResponse, AppError>> {
		try {
			// ユーザーを特定
			const userResult = await this.findUser(idm, studentId);
			if (userResult.isErr()) {
				return err(userResult.error);
			}

			// 入退室処理を実行
			const user = userResult.value;
			const response = await this.toggleUserRoomPresence(user);

			return ok(response);
		} catch (error) {
			// return this.handleUnexpectedError(error);
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

	private async findUser(
		idm: string,
		studentId?: number,
	): Promise<Result<User, AppError>> {
		return studentId != null
			? await this.findUserByStudentId(studentId)
			: await this.findUserByNfcIdm(idm);
	}

	private async findUserByStudentId(
		studentId: number,
	): Promise<Result<User, AppError>> {
		const user = await this.userRepository.findByStudentId(studentId);
		if (!user) {
			return err(
				new AppError("Student card not registered.", {
					errorCode: ERROR_CODE.STUDENT_CARD_NOT_REGISTERED,
					userMessage: {
						title: `登録されていない学生証です`,
						description: `\`/room register student-card\`コマンドで学生証を登録してください。`,
					},
				}),
			);
		}

		return ok(user);
	}

	private async findUserByNfcIdm(idm: string): Promise<Result<User, AppError>> {
		const user = await this.userRepository.findByNfcIdm(idm);
		if (!user) {
			const unknownNfcCard =
				(await this.unknownNfcCardRepository.findByIdm(idm)) ??
				(await this.unknownNfcCardRepository.create(idm));

			return err(
				new AppError("NFC card not registered.", {
					errorCode: ERROR_CODE.NFC_CARD_NOT_REGISTERED,
					userMessage: {
						title: `登録されていないNFCカードです`,
						description: `\`/room register nfc-card ${unknownNfcCard.code}\`コマンドでNFCカードを登録してください。`,
					},
				}),
			);
		}

		return ok(user);
	}

	private async toggleUserRoomPresence(user: User): Promise<TouchCardResponse> {
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

			return {
				status: "exit",
				entries: entryUsers.length,
				message: {
					title: `${name}さんが退出しました`,
					description,
					iconUrl,
					color: "red",
				},
			};
		}

		// 入室していない場合は入室ログを新規作成
		await this.roomEntryLogRepository.create(user.id, now);

		// 入室中のユーザーを取得
		const entryUsers = await this.userRepository.findAllEntryUsers();
		const description = this.buildEntryUsersMessage(entryUsers);

		return {
			status: "entry",
			entries: entryUsers.length,
			message: {
				title: `${name}さんが入室しました`,
				description,
				iconUrl,
				color: "green",
			},
		};
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
