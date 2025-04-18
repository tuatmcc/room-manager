import type { Message } from "./message";

export interface AppErrorOptions extends ErrorOptions {
	userMessage?: Message;
}

export class AppError extends Error {
	static {
		this.prototype.name = "AppError";
	}

	readonly userMessage: Message;

	constructor(message: string, options?: AppErrorOptions) {
		const { userMessage, ...rest } = options ?? {};

		super(message, rest);

		this.userMessage = userMessage ?? {
			title: "不明なエラーが発生しました",
			description:
				"不明なエラーです。時間をおいて再度お試しください。エラーが続く場合は開発者にお問い合わせください。",
		};
	}
}
