import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError, ERROR_CODE } from "@/error";
import type { Message } from "@/message";
import type { NfcCardRepository } from "@/repositories/NfcCardRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";

export class RegisterNfcCardUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly nfcCardRepository: NfcCardRepository,
		private readonly unknownNfcCardRepository: UnknownNfcCardRepository,
	) {}

	async execute(
		discordId: string,
		code: string,
		name: string,
	): Promise<Result<Message, AppError>> {
		try {
			const user =
				(await this.userRepository.findByDiscordId(discordId)) ??
				(await this.userRepository.create(discordId));

			const unknownNfcCard =
				await this.unknownNfcCardRepository.findByCode(code);
			if (!unknownNfcCard) {
				return err(
					new AppError("Unknown NFC card.", {
						errorCode: ERROR_CODE.UNKNOWN_NFC_CARD,
						userMessage: {
							title: "NFCカードの登録に失敗しました",
							description: "不明なNFCカードです。",
						},
					}),
				);
			}

			// すでに登録されているNFCカードは登録できない
			if (await this.nfcCardRepository.findByIdm(unknownNfcCard.idm)) {
				return err(
					new AppError("NFC card already registered.", {
						errorCode: ERROR_CODE.NFC_CARD_ALREADY_REGISTERED,
						userMessage: {
							title: "NFCカードの登録に失敗しました",
							description: "すでに登録されているNFCカードです。",
						},
					}),
				);
			}

			// 不明なNFCカードを削除
			await this.unknownNfcCardRepository.deleteById(unknownNfcCard.id);
			// NFCカードを登録
			await this.nfcCardRepository.create(name, unknownNfcCard.idm, user.id);

			return ok({
				title: "NFCカードの登録が完了しました🎉",
				description: "NFCカードをリーダーにタッチすることで入退出が可能です。",
			});
		} catch (error) {
			const cause = error instanceof Error ? error : undefined;

			return err(
				new AppError("Failed to register nfc card.", {
					cause,
					errorCode: ERROR_CODE.UNKNOWN,
					userMessage: {
						title: "NFCカードの登録に失敗しました",
						description:
							"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
					},
				}),
			);
		}
	}
}
