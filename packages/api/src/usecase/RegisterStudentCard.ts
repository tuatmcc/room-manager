import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { Message } from "@/message";
import type { StudentCardRepository } from "@/repositories/StudentCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export class RegisterStudentCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly studentCardRepository: StudentCardRepository,
	) {}

	async execute(
		discordId: string,
		studentId: number,
	): Promise<Result<Message, AppError>> {
		try {
			const user =
				(await this.userRepository.findByDiscordId(discordId)) ??
				(await this.userRepository.create(discordId));

			// すでに登録されている学生証番号は登録できない
			if (await this.studentCardRepository.findByStudentId(studentId)) {
				return err(
					new AppError("Student card already registered.", {
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
				await this.studentCardRepository.create(studentId, user.id);
				return ok({
					title: "学生証の登録が完了しました🎉",
					description: "学生証をリーダーにタッチすることで入退出が可能です。",
				});
			}

			// 学籍番号を更新
			const newStudentCard = oldStudentCard.updateStudentId(studentId);
			await this.studentCardRepository.save(newStudentCard);

			return ok({
				title: "学生証の登録が完了しました🎉",
				description:
					"学生証をリーダーにタッチすることで入退出が可能です。なお元の学生証は無効になります。",
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to register student card.", {
					cause,
					userMessage: {
						title: "学生証の登録に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}
}
