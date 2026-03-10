import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";

import { AppError } from "@/error";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import type { User } from "@/models/User";
import type { UserRepository } from "@/repositories/UserRepository";

export interface ListEntryUsersResult {
	users: User[];
}

export class ListEntryUsersUseCase {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly logger: AppLogger = noopLogger,
	) {}

	async execute(): Promise<Result<ListEntryUsersResult, ListEntryUsersError>> {
		try {
			const users = await this.userRepository.findAllEntryUsers();
			this.logger.info("listed entry users", {
				userCount: users.length,
			});

			return ok({ users });
		} catch (caughtError) {
			const cause = caughtError instanceof Error ? caughtError : undefined;
			this.logger.error(
				"failed to list entry users",
				serializeError(caughtError),
			);
			const error = new ListEntryUsersError("Failed to list entry users.", {
				cause,
				meta: {
					code: "UNKNOWN",
				},
			});

			return err(error);
		}
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
