import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { SuicaCardRepository } from "@/repositories/SuicaCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export class RegisterSuicaCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly suicaCardRepository: SuicaCardRepository,
	) {}

	async execute(
		discordId: string,
		suicaIdm: string,
	): Promise<Result<Message, AppError>> {
		try {
			const user =
				(await this.userRepository.findByDiscordId(discordId)) ??
				(await this.userRepository.create(discordId));

			// すでに登録されているSuicaは登録できない
			if (await this.suicaCardRepository.findBySuicaIdm(suicaIdm)) {
				return err(
					new AppError("Student card already registered.", {
						errorCode: ERROR_CODE.SUICA_CARD_ALREADY_REGISTERED,
						userMessage: {
							title: "Suicaの登録に失敗しました",
							description: "すでに登録されているSuicaです。",
						},
					}),
				);
			}

			await this.suicaCardRepository.create(suicaIdm, user.id);

			return ok({
				title: "Suicaの登録が完了しました🎉",
				description: "Suicaをリーダーにタッチすることで入退出が可能です。",
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to register student card.", {
					cause,
					errorCode: ERROR_CODE.UNKNOWN,
					userMessage: {
						title: "Suicaの登録に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}
}
