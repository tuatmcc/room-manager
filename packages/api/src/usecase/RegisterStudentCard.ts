import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
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
	): Promise<Result<void, AppError>> {
		try {
			const user =
				(await this.userRepository.findByDiscordId(discordId)) ??
				(await this.userRepository.create(discordId));

			// すでに登録されている学生証番号は登録できない
			if (await this.studentCardRepository.findByStudentId(studentId)) {
				return err(
					new AppError("Student card already registered.", {
						userMessage: "この学生証は既に登録されています。",
					}),
				);
			}

			const oldStudentCard = await this.studentCardRepository.findByUserId(
				user.id,
			);
			// 学生証が存在しない場合は新規作成して終了
			if (!oldStudentCard) {
				await this.studentCardRepository.create(studentId, user.id);
				return ok(undefined);
			}

			// 学籍番号を更新
			const newStudentCard = oldStudentCard.updateStudentId(studentId);
			await this.studentCardRepository.save(newStudentCard);

			return ok(undefined);
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to register student card.", {
					cause,
					userMessage: "学生証の登録に失敗しました。",
				}),
			);
		}
	}
}
