import type { Message } from "./message";

export const ERROR_CODE = {
	STUDENT_CARD_ALREADY_REGISTERED: "STUDENT_CARD_ALREADY_REGISTERED",
	NFC_CARD_ALREADY_REGISTERED: "NFC_CARD_ALREADY_REGISTERED",
	STUDENT_CARD_NOT_REGISTERED: "STUDENT_CARD_NOT_REGISTERED",
	NFC_CARD_NOT_REGISTERED: "NFC_CARD_NOT_REGISTERED",
	UNKNOWN_NFC_CARD: "UNKNOWN_NFC_CARD",
	UNKNOWN: "UNKNOWN",
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export interface AppErrorOptions extends ErrorOptions {
	userMessage?: Message;
	errorCode?: ErrorCode;
}

export class AppError extends Error {
	static {
		this.prototype.name = "AppError";
	}

	readonly userMessage: Message;
	readonly errorCode: ErrorCode;

	constructor(message: string, options?: AppErrorOptions) {
		const { userMessage, ...rest } = options ?? {};

		super(message, rest);

		this.userMessage = userMessage ?? {
			title: "不明なエラーが発生しました",
			description:
				"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
		};
		this.errorCode = options?.errorCode ?? ERROR_CODE.UNKNOWN;
	}
}
