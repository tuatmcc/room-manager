export interface AppErrorOptions extends ErrorOptions {
	userMessage?: string;
}

export class AppError extends Error {
	static {
		this.prototype.name = "AppError";
	}

	readonly userMessage?: string;

	constructor(message: string, options?: AppErrorOptions) {
		const { userMessage, ...rest } = options ?? {};

		super(message, rest);

		if (userMessage) {
			this.userMessage = userMessage;
		}
	}
}
