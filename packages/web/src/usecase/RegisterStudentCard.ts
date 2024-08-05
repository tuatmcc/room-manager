import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import { User } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";

export class RegisterStudentCardUseCase {
	constructor(private readonly userRepository: UserRepository) {}

	async execute(
		discordId: string,
		studentId: string,
	): Promise<Result<void, AppError>> {
		try {
			const oldUser = await this.userRepository.findByDiscordId(discordId);

			const newUser =
				oldUser?.updateStudentId(studentId) ?? User.new(discordId, studentId);

			await this.userRepository.save(newUser);

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
