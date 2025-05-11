import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { User } from "@/models/User";
import type { RoomEntryLogRepository } from "@/repositories/RoomEntryLogRepository";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export interface ExitAllEntryUsersResult {
	users: User[];
}

export class ExitAllEntryUsersUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly roomEntryLogRepository: RoomEntryLogRepository,
	) {}

	async execute(): Promise<
		Result<ExitAllEntryUsersResult, ExitAllEntryUsersError>
	> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.exit_all_entry_users",
			async (
				span,
			): Promise<Result<ExitAllEntryUsersResult, ExitAllEntryUsersError>> => {
				try {
					const entryLogs = await this.roomEntryLogRepository.findAllEntry();
					span.setAttribute(
						"room_manager.room_entry_log.count",
						entryLogs.length,
					);
					if (entryLogs.length === 0) {
						return ok({ users: [] });
					}

					const now = Temporal.Now.instant();
					await this.roomEntryLogRepository.setManyExitAt(
						entryLogs.map((log) => log.id),
						now,
					);

					const users = await this.userRepository.findByIds(
						entryLogs.map((log) => log.userId),
					);

					return ok({ users });
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new ExitAllEntryUsersError(
						"Failed to exit all entry users.",
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

interface ErrorMeta {
	code: "UNKNOWN";
}

interface ExitAllEntryUsersErrorOptions extends ErrorOptions {
	meta: ErrorMeta;
}

export class ExitAllEntryUsersError extends AppError {
	meta: ErrorMeta;

	constructor(
		message: string,
		{ meta, ...options }: ExitAllEntryUsersErrorOptions,
	) {
		super(message, options);

		this.meta = meta;
	}
}
