import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { StudentCardRepository } from "@/repositories/StudentCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export class RegisterStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly studentCardRepository: StudentCardRepository,
	) {}

	async execute(
		discordId: string,
		studentId: number,
	): Promise<Result<Message, AppError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.register_student_card",
			{
				attributes: {
					"room_manager.user.discord_id": discordId,
					"room_manager.student_card.student_id": studentId,
				},
			},
			async (span) => {
				try {
					const user =
						(await this.userRepository.findByDiscordId(discordId)) ??
						(await this.userRepository.create(discordId));
					span.setAttribute("room_manager.user.id", user.id);

					// すでに登録されている学生証番号は登録できない
					if (await this.studentCardRepository.findByStudentId(studentId)) {
						return err(
							new AppError("Student card already registered.", {
								errorCode: ERROR_CODE.STUDENT_CARD_ALREADY_REGISTERED,
								userMessage: {
									title: "学生証の登録に失敗しました",
									description: "すでに登録されている学生証番号です。",
								},
							}),
						);
					}

					const oldStudentCard = await this.studentCardRepository.findByUserId(
						user.id,
					);
					// 学生証が存在しない場合は新規作成して終了
					if (!oldStudentCard) {
						const newStudentCard = await this.studentCardRepository.create(
							studentId,
							user.id,
						);
						span.setAttribute(
							"room_manager.student_card.id",
							newStudentCard.id,
						);
						return ok({
							title: "学生証の登録が完了しました🎉",
							description:
								"学生証をリーダーにタッチすることで入退出が可能です。",
						});
					}

					// 学籍番号を更新
					const newStudentCard = oldStudentCard.updateStudentId(studentId);
					await this.studentCardRepository.save(newStudentCard);
					span.setAttribute("room_manager.student_card.id", newStudentCard.id);

					return ok({
						title: "学生証の登録が完了しました🎉",
						description:
							"学生証をリーダーにタッチすることで入退出が可能です。なお元の学生証は無効になります。",
					});
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new AppError("Failed to register student card.", {
						cause,
						errorCode: ERROR_CODE.UNKNOWN,
						userMessage: {
							title: "学生証の登録に失敗しました",
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
