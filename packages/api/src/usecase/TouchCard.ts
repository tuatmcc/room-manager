import { Temporal } from "@js-temporal/polyfill";
import { trace } from "@opentelemetry/api";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { UnknownNfcCard } from "@/models/UnknownNfcCard";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export type TouchCardStatus = "entry" | "exit";

export interface TouchCardResult {
	status: TouchCardStatus;
	entries: number;
	user: User;
}

export class TouchCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly unknownNfcCardRepository: UnknownNfcCardRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
	) {}

	async execute({
		idm,
		studentId,
	}: {
		idm: string;
		studentId?: number;
	}): Promise<Result<TouchCardResult, TouchCardError>> {
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
					const userResult =
						studentId != null
							? await this.findUserByStudentId(studentId)
							: await this.findUserByNfcIdm(idm);
					if (userResult.isErr()) {
						return err(userResult.error);
					}
					const user = userResult.value;
					user.setAttributes();

					// 入退室処理を実行
					const result = await this.toggleUserRoomPresence(user);

					return ok(result);
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new TouchCardError("Failed to touch card.", {
						cause,
						meta: {
							code: "UNKNOWN",
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

	private async findUserByStudentId(
		studentId: number,
	): Promise<Result<User, TouchCardError>> {
		const user = await this.userRepository.findByStudentId(studentId);
		if (!user) {
			return err(
				new TouchCardError("Student card not registered.", {
					meta: {
						code: "STUDENT_CARD_NOT_REGISTERED",
					},
				}),
			);
		}

		return ok(user);
	}

	private async findUserByNfcIdm(
		idm: string,
	): Promise<Result<User, TouchCardError>> {
		const user = await this.userRepository.findByNfcIdm(idm);
		if (!user) {
			const unknownNfcCard =
				(await this.unknownNfcCardRepository.findByIdm(idm)) ??
				(await this.unknownNfcCardRepository.create(idm));

			return err(
				new TouchCardError("NFC card not registered.", {
					meta: {
						code: "NFC_CARD_NOT_REGISTERED",
						unknownNfcCard,
					},
				}),
			);
		}

		return ok(user);
	}

	private async toggleUserRoomPresence(user: User): Promise<TouchCardResult> {
		const span = trace.getActiveSpan();

		const now = Temporal.Now.instant();

		const oldLastEntryLog =
			await this.roomEntryLogRepository.findLastEntryByUserId(user.id);
		// すでに入室している場合は、入室ログを更新して終了
		if (oldLastEntryLog) {
			const newLastEntryLog = oldLastEntryLog.exitRoom(now);
			await this.roomEntryLogRepository.save(newLastEntryLog);
			newLastEntryLog.setAttributes();

			// 入室中のユーザーを取得
			const entryUsers = await this.userRepository.findAllEntryUsers();
			span?.setAttribute("room_manager.user.count", entryUsers.length);

			return {
				status: "exit",
				entries: entryUsers.length,
				user,
			};
		}

		// 入室していない場合は入室ログを新規作成
		const newEntryLog = await this.roomEntryLogRepository.create(user.id, now);
		newEntryLog.setAttributes();

		// 入室中のユーザーを取得
		const entryUsers = await this.userRepository.findAllEntryUsers();
		span?.setAttribute("room_manager.user.count", entryUsers.length);

		return {
			status: "entry",
			entries: entryUsers.length,
			user,
		};
	}
}

type ErrorMeta =
	| {
			code: "STUDENT_CARD_NOT_REGISTERED";
	  }
	| {
			code: "NFC_CARD_NOT_REGISTERED";
			unknownNfcCard: UnknownNfcCard;
	  }
	| {
			code: "UNKNOWN";
	  };

interface TouchCardErrorOptions extends ErrorOptions {
	meta: ErrorMeta;
}

export class TouchCardError extends AppError {
	meta: ErrorMeta;

	constructor(message: string, { meta, ...options }: TouchCardErrorOptions) {
		super(message, options);

		this.meta = meta;
	}
}
