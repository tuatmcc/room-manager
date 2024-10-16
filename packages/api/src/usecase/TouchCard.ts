import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { Action } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";

export class TouchCardUseCase {
	constructor(private readonly userRepository: UserRepository) {}

	async execute(studentId: string): Promise<Result<Action, AppError>> {
		try {
			const user = await this.userRepository.findByStudentId(studentId);
			if (!user) {
				return err(
					new AppError("User not found", {
						userMessage: "対応するユーザーが見つかりませんでした。",
					}),
				);
			}

			const updatedUser = user.withIsInRoom(!user.isInRoom);
			await this.userRepository.save(updatedUser);

			const action = updatedUser.isInRoom ? "entered" : "exited";

			return ok(action);
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
