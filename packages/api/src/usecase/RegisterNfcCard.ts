import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import { NfcCard } from "@/models/NfcCard";
import { UnknownNfcCard } from "@/models/UnknownNfcCard";
import { User } from "@/models/User";
import type { NfcCardRepository } from "@/repositories/NfcCardRepository";
import type { UnknownNfcCardRepository } from "@/repositories/UnknownNfcCardRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

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
	): Promise<Result<void, RegisterNfcCardError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.register_nfc_card",
			{
				attributes: {
					[User.ATTRIBUTES.DISCORD_ID]: discordId,
					[UnknownNfcCard.ATTRIBUTES.CODE]: code,
					[NfcCard.ATTRIBUTES.NAME]: name,
				},
			},
			async (span) => {
				try {
					const user =
						(await this.userRepository.findByDiscordId(discordId)) ??
						(await this.userRepository.create(discordId));
					user.setAttributes();

					const unknownNfcCard =
						await this.unknownNfcCardRepository.findByCode(code);
					unknownNfcCard?.setAttributes();
					if (!unknownNfcCard) {
						return err(
							new RegisterNfcCardError("Unknown NFC card.", {
								meta: {
									code: "NFC_CARD_NOT_FOUND",
								},
							}),
						);
					}

					// すでに登録されているNFCカードは登録できない
					if (await this.nfcCardRepository.findByIdm(unknownNfcCard.idm)) {
						return err(
							new RegisterNfcCardError("NFC card already registered.", {
								meta: {
									code: "NFC_CARD_ALREADY_REGISTERED",
								},
							}),
						);
					}

					// 不明なNFCカードを削除
					await this.unknownNfcCardRepository.deleteById(unknownNfcCard.id);
					// NFCカードを登録
					const nfcCard = await this.nfcCardRepository.create(
						name,
						unknownNfcCard.idm,
						user.id,
					);
					nfcCard.setAttributes();

					return ok();
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new RegisterNfcCardError(
						"Failed to register nfc card.",
						{
							cause,
							meta: {
								code: "UNKNOWN",
							},
						},
					);

					span.recordException(error);
					return err(error);
				} finally {
					span.end();
				}
			},
		);
	}
}

type ErrorMeta =
	| {
			code: "NFC_CARD_ALREADY_REGISTERED";
	  }
	| {
			code: "NFC_CARD_NOT_FOUND";
	  }
	| {
			code: "UNKNOWN";
	  };

interface RegisterNfcCardErrorOptions extends ErrorOptions {
	meta: ErrorMeta;
}

export class RegisterNfcCardError extends AppError {
	meta: ErrorMeta;

	constructor(
		message: string,
		{ meta, ...options }: RegisterNfcCardErrorOptions,
	) {
		super(message, options);

		this.meta = meta;
	}
}
