import { createConsola } from "consola";

export type LogContext = Record<string, unknown>;

export interface AppLogger {
	child(options?: { context?: LogContext; tag?: string }): AppLogger;
	debug(message: string, context?: LogContext): void;
	info(message: string, context?: LogContext): void;
	warn(message: string, context?: LogContext): void;
	error(message: string, context?: LogContext): void;
}

class ConsolaAppLogger implements AppLogger {
	constructor(
		private readonly tag: string | undefined,
		private readonly baseContext: LogContext,
	) {}

	child(options?: { context?: LogContext; tag?: string }): AppLogger {
		return new ConsolaAppLogger(joinTags(this.tag, options?.tag), {
			...this.baseContext,
			...options?.context,
		});
	}

	debug(message: string, context?: LogContext): void {
		this.log("debug", message, context);
	}

	info(message: string, context?: LogContext): void {
		this.log("info", message, context);
	}

	warn(message: string, context?: LogContext): void {
		this.log("warn", message, context);
	}

	error(message: string, context?: LogContext): void {
		this.log("error", message, context);
	}

	private log(
		level: "debug" | "error" | "info" | "warn",
		message: string,
		context?: LogContext,
	): void {
		const logger = this.tag ? rootConsola.withTag(this.tag) : rootConsola;
		const payload = {
			...this.baseContext,
			...context,
		};

		if (Object.keys(payload).length > 0) {
			logger[level](message, payload);
			return;
		}

		logger[level](message);
	}
}

const rootConsola = createConsola();
const noop: () => void = () => undefined;

export function createLogger(options?: {
	context?: LogContext;
	tag?: string;
}): AppLogger {
	return new ConsolaAppLogger(options?.tag, options?.context ?? {});
}

export const noopLogger: AppLogger = {
	child: () => noopLogger,
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
};

export function serializeError(error: unknown): LogContext {
	if (!(error instanceof Error)) {
		return { error };
	}

	const serialized: LogContext = {
		errorMessage: error.message,
		errorName: error.name,
	};
	if (error.stack) {
		serialized["errorStack"] = error.stack;
	}
	if ("cause" in error && error.cause !== undefined) {
		serialized["errorCause"] = error.cause;
	}

	return serialized;
}

function joinTags(parentTag?: string, childTag?: string): string | undefined {
	if (parentTag && childTag) {
		return `${parentTag}:${childTag}`;
	}

	return parentTag ?? childTag;
}
