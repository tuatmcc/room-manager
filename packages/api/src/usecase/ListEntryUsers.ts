import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { User } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";
import { tracer } from "@/trace";

export interface ListEntryUsersResult {
	users: User[];
}

export class ListEntryUsersUseCase {
	constructor(private readonly userRepository: UserRepository) {}

	async execute(): Promise<Result<ListEntryUsersResult, ListEntryUsersError>> {
		return await tracer.startActiveSpan(
			"room_manager.usecase.list_entry_users",
			async (
				span,
			): Promise<Result<ListEntryUsersResult, ListEntryUsersError>> => {
				try {
					const users = await this.userRepository.findAllEntryUsers();
					span.setAttribute("room_manager.user.count", users.length);

					return ok({ users });
				} catch (caughtError) {
					const cause = caughtError instanceof Error ? caughtError : undefined;
					const error = new ListEntryUsersError("Failed to list entry users.", {
						cause,
						meta: {
							code: "UNKNOWN",
						},
					});

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

interface ListEntryUsersErrorOptions extends ErrorOptions {
	meta: ErrorMeta;
}

export class ListEntryUsersError extends AppError {
	meta: ErrorMeta;

	constructor(
		message: string,
		{ meta, ...options }: ListEntryUsersErrorOptions,
	) {
		super(message, options);

		this.meta = meta;
	}
}
