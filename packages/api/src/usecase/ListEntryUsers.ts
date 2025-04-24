import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { UserRepository } from "@/repositories/UserRepository";

export class ListEntryUsersUseCase {
	constructor(private readonly userRepository: UserRepository) {}

	async execute(): Promise<Result<Message, AppError>> {
		try {
			const users = await this.userRepository.findAllEntryUsers();

			if (users.length === 0) {
				return ok({
					title: "部室には誰も居ません",
					color: "red",
				});
			}

			const title = `入室中 (${users.length}人)`;
			const description = users
				.map((user) => `* <@${user.discordId}>`)
				.join("\n");

			return ok({
				title,
				description,
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to register nfc card.", {
					cause,
					errorCode: ERROR_CODE.UNKNOWN,
					userMessage: {
						title: "入室者一覧の取得に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}
}
