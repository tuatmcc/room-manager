import { eq } from "drizzle-orm";

import type { Database } from "@/database";
import type { AppLogger } from "@/logger";
import { noopLogger, serializeError } from "@/logger";
import { User } from "@/models/User";
import * as schema from "@/schema";

export interface UserRepository {
	create(discordId: string): Promise<User>;
	save(user: User): Promise<void>;
	findByIds(ids: number[]): Promise<User[]>;
	findByDiscordId(discordId: string): Promise<User | null>;
	findByStudentId(studentId: number): Promise<User | null>;
	findByNfcIdm(idm: string): Promise<User | null>;
	findAllEntryUsers(): Promise<User[]>;
}

export class DBUserRepository implements UserRepository {
	constructor(
		private readonly db: Database,
		private readonly logger: AppLogger = noopLogger,
	) {}

	async create(discordId: string): Promise<User> {
		try {
			const result = await this.db
				.insert(schema.users)
				.values({
					discordId,
				})
				.returning()
				.get();

			this.logger.info("created user", {
				discordId,
				userId: result.id,
			});

			return new User(result.id, result.discordId);
		} catch (error) {
			this.logger.error("failed to create user", {
				discordId,
				...serializeError(error),
			});
			throw error;
		}
	}

	async save(user: User): Promise<void> {
		try {
			await this.db
				.update(schema.users)
				.set({
					discordId: user.discordId,
				})
				.where(eq(schema.users.id, user.id))
				.returning()
				.get();

			this.logger.info("saved user", {
				discordId: user.discordId,
				userId: user.id,
			});
		} catch (error) {
			this.logger.error("failed to save user", {
				discordId: user.discordId,
				userId: user.id,
				...serializeError(error),
			});
			throw error;
		}
	}

	async findByIds(ids: number[]): Promise<User[]> {
		const result = await this.db.query.users.findMany({
			where: (users, { inArray }) => inArray(users.id, ids),
		});

		return result.map((user) => new User(user.id, user.discordId));
	}

	async findByDiscordId(discordId: string): Promise<User | null> {
		const result = await this.db.query.users.findFirst({
			where: (users, { eq }) => eq(users.discordId, discordId),
		});
		if (!result) return null;

		return new User(result.id, result.discordId);
	}

	async findByStudentId(studentId: number): Promise<User | null> {
		const result = await this.db.query.studentCards.findFirst({
			where: (studentCards, { eq }) => eq(studentCards.studentId, studentId),
			with: {
				user: true,
			},
		});
		if (!result) return null;

		return new User(result.user.id, result.user.discordId);
	}

	async findByNfcIdm(idm: string): Promise<User | null> {
		const result = await this.db.query.nfcCards.findFirst({
			where: (nfcCards, { eq }) => eq(nfcCards.idm, idm),
			with: {
				user: true,
			},
		});
		if (!result) return null;

		return new User(result.user.id, result.user.discordId);
	}

	async findAllEntryUsers(): Promise<User[]> {
		const result = await this.db.query.roomEntryLogs.findMany({
			where: (roomEntryLogs, { isNull }) => isNull(roomEntryLogs.exitAt),
			with: {
				user: true,
			},
		});

		return result.map(
			(entryLog) => new User(entryLog.user.id, entryLog.user.discordId),
		);
	}
}
