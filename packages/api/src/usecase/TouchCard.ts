import { Temporal } from "@js-temporal/polyfill";
import { trace } from "@opentelemetry/api";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import type { DiscordService } from "@/services/DiscordService";
import { tracer } from "@/trace";

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
		return await tracer.startActiveSpan(
			"room_manager.usecase.touch_card",
			{
				attributes: {
					"room_manager.nfc_card.idm": idm,
					"room_manager.student_card.student_id": studentId,
				},
			},
			async (span) => {
				try {
					// ユーザーを特定
					const userResult = await this.findUser(idm, studentId);
					if (userResult.isErr()) {
						return err(userResult.error);
					}
					const user = userResult.value;
					span.setAttribute("room_manager.user.id", user.id);
					span.setAttribute("room_manager.user.discord_id", user.discordId);

					// 入退室処理を実行
					const response = await this.toggleUserRoomPresence(user);

					return ok(response);
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new AppError("Failed to touch card.", {
						cause,
						errorCode: ERROR_CODE.UNKNOWN,
						userMessage: {
							title: "入退出に失敗しました",
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
		const span = trace.getActiveSpan();

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
			span?.setAttributes({
				"room_manager.room_entry_log.id": newLastEntryLog.id,
				"room_manager.room_entry_log.entry_at":
					newLastEntryLog.entryAt.toJSON(),
				"room_manager.room_entry_log.exit_at": newLastEntryLog.exitAt?.toJSON(),
			});

			// 入室中のユーザーを取得
			const entryUsers = await this.userRepository.findAllEntryUsers();
			const description = await this.buildEntryUsersMessage(entryUsers);
			span?.setAttribute("room_manager.user.count", entryUsers.length);

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
		const newEntryLog = await this.roomEntryLogRepository.create(user.id, now);
		span?.setAttributes({
			"room_manager.room_entry_log.id": newEntryLog.id,
			"room_manager.room_entry_log.entry_at": newEntryLog.entryAt.toJSON(),
			"room_manager.room_entry_log.exit_at": newEntryLog.exitAt?.toJSON(),
		});

		// 入室中のユーザーを取得
		const entryUsers = await this.userRepository.findAllEntryUsers();
		const description = await this.buildEntryUsersMessage(entryUsers);
		span?.setAttribute("room_manager.user.count", entryUsers.length);

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

	private async buildEntryUsersMessage(users: User[]): Promise<string> {
		if (users.length === 0) {
			return "部室には誰も居ません";
		}

		// DiscordService でキャッシュ付きでユーザー名を取得
		const names = await Promise.all(
			users.map(async (user) => {
				const { name } = await this.discordService.fetchUserInfo(
					user.discordId,
				);
				return name;
			}),
		);

		return [`入室中 (${users.length}人)`, ...names.map((n) => `* ${n}`)].join(
			"\n",
		);
	}
}
